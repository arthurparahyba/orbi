import type { ExecutionReview, Finding } from '@orbi/contracts';
import type { OrbiServices } from '../services.ts';
import { LEVEL_NAMES } from '../brain/domain/levels.ts';
import { defaultSuggestions, pipelineConfigProblems, type ConfigProblem } from '../brain/domain/review.ts';
import { analyzeRun, howToFix } from './analyzers/index.ts';
import { collected } from '../pipelines/engine.ts';
import { tellAgent } from '../conversations/tell.ts';
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
  const runs = s.brain.unreviewedRunsIn(conversationId);
  // Procedures left open when the delivery ended (a step never closed): they never finished.
  const open = ended ? s.brain.openUnreviewedRunsIn(conversationId) : [];
  if (runs.length === 0 && open.length === 0) return null;
  const out: ExecutionReview = { runs: [], config: [] };
  // What each run shows comes from the registered analyzers (review/analyzers/).
  for (const run of open) {
    out.runs.push({ runId: run.id, playbook: run.playbook, status: 'open', findings: analyzeRun(run, { open: true }) });
    s.brain.markReviewed(run.id);
  }
  for (const run of runs) {
    const settled = s.brain.settleRun(run.id);
    s.brain.markReviewed(run.id);
    const entry: ExecutionReview['runs'][number] = { runId: run.id, playbook: run.playbook, status: run.status === 'failed' ? 'failed' : 'done', findings: analyzeRun(run, { open: false }) };
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

export const hasProblems = (r: ExecutionReview) => r.config.length > 0 || r.runs.some((x) => x.findings.length > 0);

/** How each kind of finding reads in the Orbi's instruction. */
const KIND_LINE: Record<Finding['kind'], (playbook: string) => string> = {
  problema: (pb) => pb,
  melhoria: (pb) => `melhoria em ${pb}`,
  aprender: (pb) => `aprender com ${pb}`,
};

/** What the model reads with the review: what went wrong, and to propose the fixes in one batch. */
export function reviewInstruction(r: ExecutionReview): string {
  if (!hasProblems(r)) {
    return `Revisão da execução: ${r.runs.map((x) => x.playbook).join(', ')} sem problemas. O cartão já está na conversa: responda no máximo uma linha curta, ou nada.`;
  }
  const lines = [
    'Revisão da execução, feita pelo runtime (o cartão já está na conversa):',
    ...(['problema', 'melhoria', 'aprender'] as const).flatMap((kind) =>
      r.runs.flatMap((x) => {
        const texts = x.findings.filter((f) => f.kind === kind).map((f) => f.text);
        return texts.length ? [`- ${KIND_LINE[kind](x.playbook)}: ${texts.join('; ')}`] : [];
      })),
    ...groupConfig(r.config).map(([pb, texts]) => `- configuração de ${pb}: ${texts.join(' ')}`),
    'Proponha as correções com UM brain_learn: para cada procedimento com problema, o mesmo nome com os passos corrigidos ' +
      '(o que vem da esteira entra como {{parâmetro}} nos passos; dado grande vai para arquivo com saveTo). ' +
      howToFix(r.runs.flatMap((x) => x.findings)).map((t) => `${t} `).join('') +
      `${r.pipeline ? `Se precisar, inclua a esteira ${r.pipeline} ajustada no mesmo lote. ` : ''}` +
      'Diga em até três linhas o que muda. Não rode nada de novo: o desenvolvedor aprova antes.',
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
    if (!review || (!hasProblems(review) && !review.runs.some((r) => r.level))) return;
    await tellAgent(s.events, agent, {
      id: conversationId,
      message: { kind: 'signal', type: 'review', tagName: 'review', body: reviewInstruction(review), attributes: { review: JSON.stringify(review) } },
    });
  } catch (error) {
    log.error('revisão da execução falhou', { conversation: conversationId, error: error instanceof Error ? error.message : String(error) });
  }
}
