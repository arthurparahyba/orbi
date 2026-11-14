import type { PlaybookRun, RunCall } from '../../api';

export const STATUS_LABEL: Record<RunCall['status'], string> = {
  ok: 'ok', erro: 'erro', pediu: 'esperou aprovação', negado: 'você negou', observado: 'só observado', recusado: 'recusado antes de pedir',
};
export const MARK_LABEL: Record<RunCall['marks'][number], string> = {
  caro: 'leitura cara', cortado: 'resposta cortada', chamada: 'chamada errada do modelo', 'recusado-depois': 'aprovado e recusado depois',
};
/** "30 mil" — sizes in a run are big; the exact number is in the call's own detail. */
export const size = (chars: number) => (chars >= 1000 ? `${Math.round(chars / 1000)} mil` : String(chars));
export const ms = (duration: number) => (duration >= 1000 ? `${(duration / 1000).toFixed(1)} s` : `${duration} ms`);

export interface CallGroup { step: string | null; title: string; calls: RunCall[] }

/** The calls grouped by step, in the procedure's order; what is outside a step (or in a step that is gone) comes last. */
export function groupCalls(calls: readonly RunCall[], steps: PlaybookRun['steps']): CallGroup[] {
  const known = new Set(steps.map((s) => s.id));
  const groups: CallGroup[] = steps.map((s, i) => ({ step: s.id, title: `${i + 1} · ${s.label}`, calls: calls.filter((c) => c.step === s.id) }));
  const rest = calls.filter((c) => !c.step || !known.has(c.step));
  if (rest.length) groups.push({ step: null, title: 'Fora dos passos', calls: rest });
  return groups.filter((g) => g.calls.length > 0);
}

/** Only what is worth looking at: a failure, a mark, or something that waited for you. */
export const isProblem = (c: RunCall) => c.status === 'erro' || c.status === 'negado' || c.status === 'recusado' || c.marks.length > 0;

/** The head of the screen: what this execution cost and what it needed from you. */
export function runTotals(calls: readonly RunCall[]) {
  const asked = calls.filter((c) => c.approval && c.approval !== 'sozinha');
  const expensive = calls.filter((c) => c.marks.includes('caro'));
  return {
    calls: calls.length,
    chars: calls.reduce((sum, c) => sum + c.chars, 0),
    approvals: asked.length,
    failures: calls.filter((c) => c.status === 'erro').length,
    expensive: expensive.length,
    expensiveChars: expensive.reduce((sum, c) => sum + c.chars, 0),
  };
}
