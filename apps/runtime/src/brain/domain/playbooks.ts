import type { Playbook, PlaybookRun, StepStatus } from './types.ts';

/** Playbook rules: what a valid one looks like and how a run's status follows its steps. */

const PLAYBOOK_NAME = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function playbookProblems(pb: Pick<Playbook, 'name' | 'steps'>): string[] {
  const problems: string[] = [];
  if (!PLAYBOOK_NAME.test(pb.name)) problems.push(`nome de playbook inválido: ${pb.name}`);
  if (!Array.isArray(pb.steps) || pb.steps.length === 0) return [...problems, 'playbook sem passos'];
  const ids = new Set<string>();
  pb.steps.forEach((step, i) => {
    if (!step.id?.trim()) problems.push(`passo ${i + 1} sem id`);
    else if (ids.has(step.id)) problems.push(`id de passo repetido: ${step.id}`);
    ids.add(step.id);
    if (!step.label?.trim()) problems.push(`passo ${i + 1} sem nome`);
  });
  return problems;
}

/** A new step id from a label, not used by the steps already there ("Abrir o portal" → "abrir-o-portal"). */
export function stepId(label: string, taken: Iterable<string>): string {
  const base = label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'passo';
  const used = new Set(taken);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Parameters learned as {{name}} are filled in a run's labels. Credentials
 * ({{segredo:…}}) never match: they stay references, resolved inside the browser tool.
 */
export function fillParams(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (all, key: string) => params[key] ?? all);
}

/** A new run of `pb`: every step pending, parameters filled. */
export function newRun(pb: Playbook, id: string, conversationId: string, params: Record<string, string>, startedAt: string): PlaybookRun {
  return {
    id,
    playbook: pb.name,
    conversationId,
    status: 'running',
    steps: pb.steps.map((s) => ({ ...s, label: fillParams(s.label, params), how: fillParams(s.how, params), status: 'pending' as StepStatus })),
    startedAt,
    finishedAt: null,
  };
}

/** Marks a step and recomputes the run: any failure fails it; all done (or skipped) finishes it. */
export function advanceRun(run: PlaybookRun, stepId: string, status: StepStatus, note: string | undefined, at: string): PlaybookRun {
  const steps = run.steps.map((s) => (s.id === stepId ? { ...s, status, ...(note === undefined ? {} : { note }) } : s));
  if (!steps.some((s) => s.id === stepId)) throw new Error(`passo não encontrado: ${stepId}`);
  const allDone = steps.every((s) => s.status === 'done' || s.status === 'skipped');
  const anyFailed = steps.some((s) => s.status === 'failed');
  const anyWaiting = steps.some((s) => s.status === 'waiting');
  const next: PlaybookRun['status'] = anyFailed ? 'failed' : allDone ? 'done' : anyWaiting ? 'waiting' : 'running';
  return { ...run, steps, status: next, finishedAt: next === 'done' || next === 'failed' ? at : null };
}
