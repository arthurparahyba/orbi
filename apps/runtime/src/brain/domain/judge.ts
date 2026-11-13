/**
 * The judge of the end-of-run review: what of what the review found is worth the developer's
 * attention, and what may change the procedure. The goal of a procedure is to do what it
 * promises and gain autonomy, not to become perfect: knowledge always passes, a problem that
 * comes back every time is proposed to be fixed at the root, and the steps change only when the
 * run did not get to the end or the gain is high. Everything else is kept as an idea, quietly.
 * Pure rules (docs/funcionalidades/19).
 */
import type { Deviation, RunAction } from './levels.ts';
import { workedAround } from './levels.ts';
import type { KnownProblem } from './knowledge.ts';

/** A change that saves at least this share of the run's approvals (or time, or tokens) is worth it. */
export const HIGH_GAIN = 0.3;
/** Runs in a row with the same known problem before proposing to fix it at the root. */
export const RECURRING_AFTER = 2;
/** How long the scope of an asked-for change holds (the Orbi proposes it in the same review turn). */
export const CHANGE_SCOPE_MS = 2 * 60 * 60 * 1000;

export type ReviewNoteKind = 'idea' | 'environment' | 'change';
/** idea: kept · environment: open (asked), dismissed (not now), done (fixed) · change: open, applied. */
export type ReviewNoteStatus = 'kept' | 'open' | 'dismissed' | 'done' | 'applied';

export interface ReviewNote {
  id: string;
  playbook: string;
  kind: ReviewNoteKind;
  /** What it is about: the analyzer of an idea, the problem of an environment, the steps of a change (JSON). */
  subject: string;
  text: string;
  runId: string | null;
  conversationId: string;
  status: ReviewNoteStatus;
  /** Times the review came across it. */
  times: number;
  createdAt: string;
  updatedAt: string;
}

export interface JudgedFinding { kind: 'problema' | 'melhoria' | 'aprender'; text: string; analyzer: string }

export interface JudgeInput {
  run: {
    status: string;
    steps: ReadonlyArray<{ id: string; status: string }>;
    deviations: Deviation[];
    actions: RunAction[];
    asked?: number;
  };
  findings: JudgedFinding[];
  /** Known problems this run ran into, with how many runs in a row they came back. */
  recurring: Array<{ problem: KnownProblem; runs: number }>;
  /** The developer was already asked to fix this problem's environment (open or "agora não"). */
  environmentAsked(problemId: string): boolean;
}

export type Verdict =
  /** The run did not get to the end (or a step did not): change only these steps. */
  | { kind: 'changeProcedure'; why: string; steps: string[]; texts: string[] }
  /** A new problem to remember (knowledge: always welcome). */
  | { kind: 'learnProblem'; texts: string[] }
  /** The same known problem in every run: fix it once, at the root. */
  | { kind: 'fixEnvironment'; problem: KnownProblem; runs: number }
  /** A good idea that is not worth changing the procedure now: kept, no card. */
  | { kind: 'keepIdea'; analyzer: string; text: string; why: string };

const INLINE_PYTHON = /^run_command python3 (?:-\S+ )*-c /;

/** Approvals a change would save, and in which steps: each inline Python asks every time (a script would become known). */
function approvalsSaved(analyzer: string, run: JudgeInput['run']): { saved: number; steps: string[] } {
  if (analyzer !== 'python-na-hora') return { saved: 0, steps: [] };
  const inline = run.actions.filter((a) => a.tool === 'run_command' && INLINE_PYTHON.test(a.fingerprint));
  return { saved: inline.length, steps: [...new Set(inline.flatMap((a) => (a.step ? [a.step] : [])))] };
}

/** The steps a problem points at: those that failed, were skipped, stayed open, or had a failure not got past. */
function troubledSteps(run: JudgeInput['run']): string[] {
  const out = new Set<string>();
  for (const s of run.steps) if (s.status === 'failed' || s.status === 'skipped' || s.status === 'running' || s.status === 'waiting') out.add(s.id);
  for (const d of run.deviations) {
    if (!d.step || d.recovered || d.kind === 'comando' || d.kind === 'chamada' || workedAround(d, run.steps)) continue;
    out.add(d.step);
  }
  return [...out];
}

export function judge(input: JudgeInput): Verdict[] {
  const out: Verdict[] = [];
  const problems = input.findings.filter((f) => f.kind === 'problema');
  if (problems.length) {
    const why = input.run.status === 'failed' ? 'a execução falhou' : 'a execução não chegou ao fim como devia';
    out.push({ kind: 'changeProcedure', why, steps: troubledSteps(input.run), texts: problems.map((f) => f.text) });
  }
  // The developer typed during the run: maybe a correction of how a step is done. That step may change.
  const said = input.run.deviations.filter((d) => d.kind === 'intervencao');
  if (said.length) {
    const steps = [...new Set(said.flatMap((d) => (d.step ? [d.step] : [])))];
    out.push({ kind: 'changeProcedure', why: `você interveio durante a execução (${said.map((d) => d.detail).join('; ')}); se foi só uma confirmação, não mude nada`, steps, texts: [] });
  }
  const learn = input.findings.filter((f) => f.kind === 'aprender');
  if (learn.length) out.push({ kind: 'learnProblem', texts: learn.map((f) => f.text) });

  const asked = input.run.asked ?? 0;
  for (const f of input.findings.filter((x) => x.kind === 'melhoria')) {
    const { saved, steps } = approvalsSaved(f.analyzer, input.run);
    if (asked > 0 && saved / asked >= HIGH_GAIN) {
      out.push({ kind: 'changeProcedure', why: `corta ${saved} de ${asked} aprovações`, steps, texts: [f.text] });
    } else {
      out.push({ kind: 'keepIdea', analyzer: f.analyzer, text: f.text, why: asked > 0 && saved > 0 ? `cortaria ${saved} de ${asked} aprovações` : 'não muda o resultado nem a autonomia' });
    }
  }

  for (const r of input.recurring) {
    if (r.runs >= RECURRING_AFTER && !input.environmentAsked(r.problem.id)) out.push({ kind: 'fixEnvironment', problem: r.problem, runs: r.runs });
  }
  return out;
}

/**
 * The steps both versions have must come in the same order: a step moved (extract before opening
 * the site) breaks the procedure though every step reads the same.
 */
export function orderChanged(before: readonly string[], after: readonly string[]): string | undefined {
  const kept = after.filter((id) => before.includes(id));
  const was = before.filter((id) => after.includes(id));
  const at = kept.findIndex((id, i) => id !== was[i]);
  return at < 0 ? undefined : `a ordem dos passos (${kept[at]} veio antes de ${was[at]}: mantenha a ordem de antes)`;
}

/**
 * When a review asked to change only some steps: the steps of the new version outside that
 * scope must stay as they are (same id, label and how). Empty scope = only scripts and how may
 * be added to the steps the finding names, nothing else is limited here.
 */
export function outOfScope(
  before: ReadonlyArray<{ id: string; label: string; how: string }>,
  after: ReadonlyArray<{ id: string; label: string; how: string }>,
  allowed: readonly string[],
): string[] {
  if (allowed.length === 0) return [];
  const was = new Map(before.map((s) => [s.id, s]));
  const changed: string[] = [];
  for (const s of after) {
    if (allowed.includes(s.id)) continue;
    const old = was.get(s.id);
    if (!old) changed.push(`${s.id} (novo)`);
    else if (old.label !== s.label || old.how !== s.how) changed.push(s.id);
  }
  for (const id of was.keys()) if (!allowed.includes(id) && !after.some((s) => s.id === id)) changed.push(`${id} (removido)`);
  const moved = orderChanged(before.map((s) => s.id), after.map((s) => s.id));
  if (moved) changed.push(moved);
  return changed;
}
