import type { ExecutionReview, Finding } from '@orbi/contracts';
import type { PlaybookRun } from '../brain/domain/types.ts';
import { judge } from '../brain/domain/judge.ts';
import type { OrbiServices } from '../services.ts';
import { LEVEL_NAMES } from '../brain/domain/levels.ts';
import { defaultSuggestions, pipelineConfigProblems, type ConfigProblem } from '../brain/domain/review.ts';
import { analyzeRun, howToFix } from './analyzers/index.ts';
import { collected } from '../pipelines/engine.ts';
import { tellAgent } from '../conversations/tell.ts';
import { startKnowledgeReview } from './knowledge.ts';
import { log } from '../observability/log.ts';
import type { Agent } from '../agents/runtime-port.ts';


/**
 * The review at the end of an execution. It runs when the conversation's turn ends, so every
 * tool failure has been reported by then (even of calls made in parallel with the step that
 * closed the run). For each run that ended and was not reviewed: its problems (deviations,
 * steps given as done whose tool failed), the level settled on that basis, and, in an esteira,
 * the configuration problems. Returns null when there was nothing to review.
 */
export function reviewConversation(s: Pick<OrbiServices, 'brain' | 'inbox' | 'pipelines'>, conversationId: string): ExecutionReview | null {
  // A delivery is reviewed once, when it ends or stops for a decision, not at every approval on the way.
  const delivery = s.pipelines.runs.inConversation(conversationId);
  if (delivery?.status === 'running') return null;
  const ended = delivery && (delivery.status === 'done' || delivery.status === 'cancelled');
  let runs = s.brain.unreviewedRunsIn(conversationId);
  // Procedures left open when the delivery ended (a step never closed): they never finished.
  let open = ended ? s.brain.openUnreviewedRunsIn(conversationId) : [];
  if (runs.length === 0 && open.length === 0) return null;
  const out: ExecutionReview = { runs: [], config: [] };
  // What each run shows comes from the registered analyzers (review/analyzers/).
  // A rehearsal has no procedure yet: nothing to settle; what it found goes to the learning card.
  for (const run of [...open, ...runs].filter((r) => r.kind === 'rehearsal')) s.brain.markReviewed(run.id);
  open = open.filter((r) => r.kind !== 'rehearsal');
  runs = runs.filter((r) => r.kind !== 'rehearsal');
  if (runs.length === 0 && open.length === 0) return null;
  const judged = (run: PlaybookRun, findings: Finding[]) => applyVerdicts(s, out, run, findings, conversationId);
  for (const run of open) {
    const findings = judged(run, analyzeRun(run, { open: true }));
    out.runs.push({ runId: run.id, playbook: run.playbook, status: 'open', findings });
    s.brain.markReviewed(run.id);
  }
  for (const run of runs) {
    const settled = s.brain.settleRun(run.id);
    s.brain.markReviewed(run.id);
    const after = s.brain.run(run.id) ?? run;
    const findings = judged(after, analyzeRun(after, { open: false }));
    const entry: ExecutionReview['runs'][number] = { runId: run.id, playbook: run.playbook, status: run.status === 'failed' ? 'failed' : 'done', findings };
    if (settled.change) {
      const { from, to, reason } = settled.change;
      const item = s.inbox.add({
        kind: 'level',
        conversationId,
        title: `${run.playbook} ${to > from ? 'subiu' : 'desceu'} para ${LEVEL_NAMES[to]}`,
        detail: reason,
        // For level notes: what changed (routine) and the value before (approvalId), for "Manter".
        routine: `playbook:${run.playbook}`,
        approvalId: String(from),
      });
      entry.level = { from, to, reason, inboxId: item.id, alone: settled.alone, asks: settled.asks };
    }
    out.runs.push(entry);
  }
  // The esteira this conversation delivers: what its configuration keeps from flowing.
  const def = delivery && s.brain.pipeline(delivery.pipeline);
  if (delivery && def) {
    out.pipeline = def.name;
    out.config = delivery.waiting?.kind === 'passage' ? [] : pipelineConfigProblems(def, (name) => s.brain.playbook(name), collected(delivery).stages);
    // The same answer in the last deliveries: keep it as the input's default.
    const recent = s.pipelines.runs.list({ limit: 50 }).filter((r) => r.pipeline === def.name).slice(0, 3).map((r) => r.inputs);
    for (const d of ended ? defaultSuggestions(def.inputs, recent) : []) {
      out.config.push({
        stage: 'entrada', playbook: def.name,
        text: `a entrada ${d.input} não tem padrão e você usou "${d.value}" nas últimas ${d.times} entregas: guarde como padrão (default) da entrada na esteira.`,
      });
    }
  }
  return out;
}

/**
 * The judge decides what of a run's findings is worth the developer's attention
 * (brain/domain/judge.ts): the change it allows (and its scope), the environment to fix at the
 * root, the ideas kept quietly. Returns the findings the card shows for the run: improvements
 * kept as ideas leave the run's list and appear as "ideia guardada".
 */
function applyVerdicts(s: Pick<OrbiServices, 'brain'>, out: ExecutionReview, run: PlaybookRun, findings: Finding[], conversationId: string): Finding[] {
  const verdicts = judge({
    run,
    findings,
    recurring: s.brain.review.recurringIn(run),
    environmentAsked: (id) => s.brain.review.environmentAsked(run.playbook, id),
  });
  const kept = new Set<string>();
  for (const v of verdicts) {
    if (v.kind === 'changeProcedure') {
      const same = (out.change ??= []).find((c) => c.playbook === run.playbook);
      if (same) {
        same.steps = [...new Set([...same.steps, ...v.steps])];
        same.why = `${same.why}; ${v.why}`;
      } else out.change.push({ playbook: run.playbook, why: v.why, steps: v.steps });
    } else if (v.kind === 'fixEnvironment') {
      const note = s.brain.review.askEnvironment(run.playbook, v.problem, v.runs, run.id, conversationId);
      const p = v.problem;
      (out.environment ??= []).push({
        noteId: note.id, playbook: run.playbook, problem: p.id, sintoma: p.sintoma, solucao: p.solucao, runs: v.runs,
        ...(p.causa ? { causa: p.causa } : {}), ...(p.raiz ? { raiz: p.raiz } : {}), ...(p.quemCorrige ? { quemCorrige: p.quemCorrige } : {}),
      });
    } else if (v.kind === 'keepIdea') {
      const note = s.brain.review.keepIdea(run.playbook, v.analyzer, v.text, run.id, conversationId);
      (out.ideas ??= []).push({ noteId: note.id, playbook: run.playbook, text: v.text, why: v.why });
      kept.add(v.text);
    }
  }
  // The steps the Orbi may touch when it proposes the fix (the learning card refuses the rest).
  for (const c of out.change ?? []) if (c.playbook === run.playbook) s.brain.review.scopeChange(run.playbook, c.steps, run.id, conversationId);
  return findings.filter((f) => !kept.has(f.text));
}

/** How each kind of finding reads in the Orbi's instruction. */
const KIND_LINE: Record<Finding['kind'], (playbook: string) => string> = {
  problema: (pb) => pb,
  melhoria: (pb) => `melhoria em ${pb}`,
  aprender: (pb) => `aprender com ${pb}`,
};

/** Something the model must act on: a change allowed, a problem to learn, an environment to explain, the esteira's configuration. */
export const hasProblems = (r: ExecutionReview) =>
  r.config.length > 0 || (r.change?.length ?? 0) > 0 || (r.environment?.length ?? 0) > 0 || r.runs.some((x) => x.findings.some((f) => f.kind === 'aprender'));

/** What the model reads with the review: only what the judge let through, and to propose it in one batch. */
/**
 * `machine`: what this machine offers (allowed commands, shell, browser, coding agent), so a
 * proposed fix only uses tools that exist.
 */
export function reviewInstruction(r: ExecutionReview, machine?: string): string {
  if (!hasProblems(r)) {
    return `Revisão da execução: ${r.runs.map((x) => x.playbook).join(', ')} sem nada para mudar. O cartão já está na conversa: responda no máximo uma linha curta, ou nada. Não proponha melhorias.`;
  }
  const changed = new Set((r.change ?? []).map((c) => c.playbook));
  const findings = r.runs.flatMap((x) => x.findings.filter((f) => f.kind === 'aprender' || changed.has(x.playbook)));
  const lines = [
    'Revisão da execução, feita pelo runtime (o cartão já está na conversa). Autonomia antes de perfeição: proponha só o que está abaixo.',
    ...(r.change ?? []).map((c) => {
      const texts = r.runs.filter((x) => x.playbook === c.playbook).flatMap((x) => x.findings.filter((f) => f.kind !== 'aprender').map((f) => f.text));
      const scope = c.steps.length ? `Mude só os passos ${c.steps.join(', ')}; os outros ficam exatamente como estão (o cartão recusa mudança fora deles).` : 'Mude o mínimo necessário.';
      return `- mudar ${c.playbook} (${c.why}): ${texts.join('; ')}. ${scope}`;
    }),
    ...r.runs.flatMap((x) => {
      const texts = x.findings.filter((f) => f.kind === 'aprender').map((f) => f.text);
      return texts.length ? [`- ${KIND_LINE.aprender(x.playbook)}: ${texts.join('; ')}`] : [];
    }),
    ...(r.environment ?? []).map((e) =>
      `- ${e.playbook}: o problema conhecido ${e.problem} ("${e.sintoma}") voltou em ${e.runs} execuções seguidas; a solução de contorno é "${e.solucao}". ` +
      'O cartão já pergunta ao desenvolvedor se quer corrigir o ambiente. Em até quatro linhas, explique a causa, a correção de vez e quem faz. ' +
      (e.raiz ? `A correção de vez guardada é "${e.raiz}". ` : 'Ainda não há correção de vez (raiz) guardada: investigue em modo leitura e inclua raiz no problema conhecido no mesmo brain_learn. '),
    ),
    ...groupConfig(r.config).map(([pb, texts]) => `- configuração de ${pb}: ${texts.join(' ')}`),
    ...((r.change?.length ?? 0) > 0 ? ['Antes de propor a mudança, ative a skill `corrigir-procedimento`.'] : []),
    ...(machine ? [`O que esta máquina oferece: ${machine}.`] : []),
    'Proponha tudo com UM brain_learn' +
      `${(r.change ?? []).length ? ': para cada procedimento a mudar, o mesmo nome com só os passos indicados mudados (o que vem da esteira entra como {{parâmetro}} nos passos; dado grande vai para arquivo com saveTo)' : ''}. ` +
      howToFix(findings).map((t) => `${t} `).join('') +
      `${r.pipeline ? `Se precisar, inclua a esteira ${r.pipeline} ajustada no mesmo lote. ` : ''}` +
      'Diga em até três linhas o que muda. Não proponha melhorias além disso e não rode nada de novo: o desenvolvedor aprova antes.',
  ];
  return lines.join('\n');
}

function groupConfig(config: ConfigProblem[]): Array<[string, string[]]> {
  const by = new Map<string, string[]>();
  for (const c of config) by.set(c.playbook, [...(by.get(c.playbook) ?? []), c.text]);
  return [...by];
}

/**
 * Reviews what ended in a conversation and, when there is something to show (a problem, a level
 * change), tells the conversation: the card comes from the signal's data, and the Orbi proposes
 * the fixes. A clean run with no level change passes quietly.
 */
export async function sendReview(s: OrbiServices, agent: Agent, conversationId: string): Promise<void> {
  try {
    const review = reviewConversation(s, conversationId);
    // What each reviewed run read goes to the knowledge reviewer, whatever else the review found.
    for (const r of review?.runs ?? []) void startKnowledgeReview(s, agent, r.runId);
    if (!review || (!hasProblems(review) && !review.runs.some((r) => r.level))) return;
    await tellAgent(s.events, agent, {
      id: conversationId,
      message: { kind: 'signal', type: 'review', tagName: 'review', body: reviewInstruction(review, machineLine(s)), attributes: { review: JSON.stringify(review) } },
    });
  } catch (error) {
    log.error('revisão da execução falhou', { conversation: conversationId, error: error instanceof Error ? error.message : String(error) });
  }
}

/** What this machine offers a procedure, in one line (it changes from one machine to another). */
export function machineLine(s: Pick<OrbiServices, 'config' | 'codeAgents'>): string {
  return [
    `comandos permitidos no run_command: ${s.config.allowedBinaries.join(', ')}`,
    s.config.shell ? 'shell do desenvolvedor no run_shell (linha nova sempre pede aprovação)' : 'sem shell do desenvolvedor',
    'scripts do procedimento com run_script',
    'navegador com browser_act (saveTo grava o que a página devolve)',
    s.codeAgents.available() ? 'agente de código para corrigir código' : 'sem agente de código',
  ].join('; ');
}
