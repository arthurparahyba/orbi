import { runDeviations } from '../../brain/domain/levels.ts';
import { stepClaimProblems } from '../../brain/domain/review.ts';
import type { RunAnalyzer } from './types.ts';

/** A procedure left open when its delivery ended: the esteira did not go on through it. */
export const openRun: RunAnalyzer = {
  id: 'aberto',
  kind: 'problema',
  analyze: (run, ctx) => {
    if (!ctx.open) return [];
    const pending = run.steps.filter((x) => x.status !== 'done' && x.status !== 'skipped').map((x) => x.id);
    const one = pending.length === 1;
    return [`ficou aberto: ${one ? 'o passo' : 'os passos'} ${pending.join(', ')} não ${one ? 'foi fechado' : 'foram fechados'}, então a esteira não seguiu por ele`];
  },
};

/** A step given as done whose tool failed. */
export const stepClaims: RunAnalyzer = { id: 'passo-feito-com-falha', kind: 'problema', analyze: (run) => stepClaimProblems(run) };

/** What went wrong in the run (failures, denials, failed or skipped steps), each once. */
export const deviations: RunAnalyzer = {
  id: 'desvios',
  kind: 'problema',
  analyze: (run) => {
    // A failure behind a step given as done already reads as that claim.
    const claimed = new Set(run.deviations.filter((d) => d.kind === 'falha' && run.steps.some((x) => x.id === d.step && x.status === 'done')).map((d) => d.detail));
    return runDeviations(run).filter((d) => !claimed.has(d));
  },
};
