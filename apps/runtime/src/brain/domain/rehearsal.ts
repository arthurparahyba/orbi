import type { PlaybookRun, StepStatus } from './types.ts';
import { stepId } from './playbooks.ts';

/**
 * The rehearsal (docs/funcionalidades/18): before a procedure exists, the Orbi tries out what
 * was explained, step by step, and ends agreeing with the developer where it starts and ends.
 * It is a run with `kind: 'rehearsal'` and no procedure; its steps grow as they are tried.
 */

/** The name a rehearsal carries in the run's `playbook` column (there is no procedure yet). */
export const REHEARSAL = 'ensaio';

/** What the developer and the Orbi agreed at the end of a rehearsal, before the learning card. */
export interface Agreement {
  /** When the procedure starts ("alguém pede para subir versão de um MFE"). */
  start: string;
  /** What it needs to receive each time. */
  receives: string[];
  /** When it is over ("o release fica verde, até 10 min"). */
  end: string;
  /** What stays out (other procedures, steps the developer does not want). */
  outside: string[];
  /** What the rehearsal corrected in the explanation: what was said, and what it really is. */
  corrections: Array<{ explained: string; actual: string }>;
}

export function newRehearsal(id: string, conversationId: string, goal: string, at: string): PlaybookRun {
  return {
    id, playbook: REHEARSAL, kind: 'rehearsal', conversationId, status: 'running',
    params: { objetivo: goal }, outputs: {}, actions: [], deviations: [], steps: [], resolved: {},
    startedAt: at, finishedAt: null,
  };
}

/** A step tried in the rehearsal: a new one (by its label) or an update of one already there (by id). */
export function rehearsalStep(run: PlaybookRun, step: { id?: string; label: string; status: StepStatus; note?: string }): PlaybookRun {
  if (run.kind !== 'rehearsal') throw new Error('não é um ensaio');
  if (run.status === 'done' || run.status === 'failed') throw new Error('o ensaio já terminou');
  const existing = step.id ? run.steps.find((s) => s.id === step.id) : run.steps.find((s) => s.label === step.label);
  const steps = existing
    ? run.steps.map((s) => (s === existing ? { ...s, label: step.label || s.label, status: step.status, ...(step.note === undefined ? {} : { note: step.note }) } : s))
    : [...run.steps, { id: step.id ?? stepId(step.label, run.steps.map((s) => s.id)), label: step.label, how: '', status: step.status, ...(step.note ? { note: step.note } : {}) }];
  return { ...run, steps, status: steps.some((s) => s.status === 'waiting') ? 'waiting' : 'running' };
}

/** Problems with an agreement; empty = it can be shown to the developer. */
export function agreementProblems(a: Agreement): string[] {
  const problems: string[] = [];
  if (!a.start?.trim()) problems.push('diga quando o procedimento começa (start)');
  if (!a.end?.trim()) problems.push('diga quando ele termina (end)');
  return problems;
}

/** Ends the rehearsal with the agreement; steps still open are closed as skipped. */
export function finishRehearsal(run: PlaybookRun, agreement: Agreement, at: string): PlaybookRun {
  if (run.kind !== 'rehearsal') throw new Error('não é um ensaio');
  const steps = run.steps.map((s) => (s.status === 'pending' || s.status === 'running' || s.status === 'waiting' ? { ...s, status: 'skipped' as StepStatus } : s));
  return { ...run, steps, status: 'done', finishedAt: at, outputs: { ...run.outputs, acordo: JSON.stringify(agreement) } };
}

export function agreementOf(run: PlaybookRun | undefined): Agreement | undefined {
  const text = run?.outputs?.acordo;
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Agreement;
  } catch {
    return undefined;
  }
}

/**
 * What proves a procedure works (`testedRun`): a finished rehearsal with its agreement, or a run of
 * that same procedure that ended well. Null = valid.
 */
export function testedRunProblem(run: PlaybookRun | undefined, playbook: string, id: string): string | null {
  if (!run) return `testedRun: a execução ${id} não existe`;
  if (run.kind === 'rehearsal') return agreementOf(run) ? null : `testedRun: o ensaio ${id} ainda não terminou com o acordo de início e fim (rehearsal_finish)`;
  if (run.playbook !== playbook || run.status !== 'done') return `testedRun: ${id} não é uma execução de ${playbook} que deu certo`;
  return null;
}
