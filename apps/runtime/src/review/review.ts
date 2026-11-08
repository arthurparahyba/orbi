import type { ExecutionReview } from '@orbi/contracts';
import type { OrbiServices } from '../services.ts';
import { LEVEL_NAMES } from '../brain/domain/levels.ts';
import { pipelineConfigProblems, stepClaimProblems, type ConfigProblem } from '../brain/domain/review.ts';
import { collected } from '../pipelines/engine.ts';

/**
 * The review at the end of an execution. It runs when the conversation's turn ends, so every
 * tool failure has been reported by then (even of calls made in parallel with the step that
 * closed the run). For each run that ended and was not reviewed: its problems (deviations,
 * steps given as done whose tool failed), the level settled on that basis, and, in an esteira,
 * the configuration problems. Returns null when there was nothing to review.
 */
export function reviewConversation(s: Pick<OrbiServices, 'brain' | 'inbox' | 'pipelines'>, conversationId: string): ExecutionReview | null {
  const runs = s.brain.unreviewedRunsIn(conversationId);
  if (runs.length === 0) return null;
  const out: ExecutionReview = { runs: [], config: [] };
  for (const run of runs) {
    const settled = s.brain.settleRun(run.id);
    // A failure behind a step given as done reads once, as that claim.
    const claims = stepClaimProblems(run);
    const claimed = new Set(run.deviations.filter((d) => d.kind === 'falha' && run.steps.some((x) => x.id === d.step && x.status === 'done')).map((d) => d.detail));
    const problems = [...new Set([...claims, ...settled.deviations.filter((d) => !claimed.has(d))])];
    s.brain.markReviewed(run.id);
    const entry: ExecutionReview['runs'][number] = { runId: run.id, playbook: run.playbook, status: run.status === 'failed' ? 'failed' : 'done', problems };
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
  const delivery = s.pipelines.runs.inConversation(conversationId);
  const def = delivery && s.brain.pipeline(delivery.pipeline);
  if (delivery && def) {
    out.pipeline = def.name;
    out.config = pipelineConfigProblems(def, (name) => s.brain.playbook(name), collected(delivery).stages);
  }
  return out;
}

export const hasProblems = (r: ExecutionReview) => r.config.length > 0 || r.runs.some((x) => x.problems.length > 0);

/** What the model reads with the review: what went wrong, and to propose the fixes in one batch. */
export function reviewInstruction(r: ExecutionReview): string {
  if (!hasProblems(r)) {
    return `Revisão da execução: ${r.runs.map((x) => x.playbook).join(', ')} sem problemas. O cartão já está na conversa: responda no máximo uma linha curta, ou nada.`;
  }
  const lines = [
    'Revisão da execução, feita pelo runtime (o cartão já está na conversa):',
    ...r.runs.filter((x) => x.problems.length).map((x) => `- ${x.playbook}: ${x.problems.join('; ')}`),
    ...groupConfig(r.config).map(([pb, texts]) => `- configuração de ${pb}: ${texts.join(' ')}`),
    'Proponha as correções com UM brain_learn: para cada procedimento com problema, o mesmo nome com os passos corrigidos ' +
      '(o que vem da esteira entra como {{parâmetro}} nos passos; dado grande vai para arquivo com saveTo; tabela no show_ui com até 20 linhas). ' +
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
