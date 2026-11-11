/**
 * Known problems: what the Orbi learned while running procedures (a check that fails, a stuck
 * pipeline, coverage below the minimum) and how it was solved. They live in the brain as facts,
 * of whatever type the Orbi created for them, so the same problem serves every procedure that
 * runs into it. What makes an entity a known problem is its shape: a `sintoma` (what shows up)
 * and a `solucao` (what solves it), with `causa` and `onde` when known. A problem solved in code
 * says who fixes it (`quem_corrige`: the coding agent) and how to check before applying (`conferir`).
 * Pure rules.
 */
import type { Entity } from './types.ts';
import type { Deviation } from './levels.ts';
import { stem, words } from './similarity.ts';

export interface KnownProblem {
  id: string;
  type: string;
  sintoma: string;
  causa?: string;
  solucao: string;
  onde?: string;
  /** Who fixes it, e.g. "agente de código": the Orbi delegates the fix (code_agent_fix_known). */
  quemCorrige?: string;
  /** How to check a fix before applying it (e.g. the test command). */
  conferir?: string;
  /**
   * The fix at the root, done once (and who does it), as opposed to `solucao`, what the Orbi
   * does each time to get past it. A problem that keeps coming back is proposed to be fixed
   * this way (domain/judge.ts).
   */
  raiz?: string;
}

const prop = (props: Record<string, unknown>, ...names: string[]): string | undefined => {
  for (const [k, v] of Object.entries(props)) {
    const key = k.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (names.includes(key) && typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
};

/** The entity as a known problem, if it is one (it has a symptom and a solution). */
export function asKnownProblem(e: Entity): KnownProblem | undefined {
  const sintoma = prop(e.props, 'sintoma', 'symptom', 'erro', 'mensagem');
  const solucao = prop(e.props, 'solucao', 'solution', 'correcao');
  if (!sintoma || !solucao) return undefined;
  const causa = prop(e.props, 'causa', 'cause');
  const onde = prop(e.props, 'onde', 'where', 'passo');
  const quemCorrige = prop(e.props, 'quem_corrige', 'quemcorrige', 'corrige_com', 'fixed_by');
  const conferir = prop(e.props, 'conferir', 'como_conferir', 'check');
  const raiz = prop(e.props, 'raiz', 'correcao_de_vez', 'correcao_definitiva', 'root_fix');
  return { id: e.id, type: e.type, sintoma, solucao, ...(causa ? { causa } : {}), ...(onde ? { onde } : {}), ...(quemCorrige ? { quemCorrige } : {}), ...(conferir ? { conferir } : {}), ...(raiz ? { raiz } : {}) };
}

/** Whether the problem is fixed in code by the coding agent (the Orbi delegates, it does not edit). */
export function fixedByCodeAgent(p: Pick<KnownProblem, 'quemCorrige'>): boolean {
  return /agente|agent/i.test(p.quemCorrige ?? '');
}

const stems = (text: string) => new Set(words(text).map(stem));

/**
 * Whether an error is this problem: most of the symptom's words show up in the error. The error
 * is long (a log) and the symptom short, so the measure is how much of the symptom it covers.
 */
export function matchesProblem(problem: Pick<KnownProblem, 'sintoma'>, errorText: string): boolean {
  const want = stems(problem.sintoma);
  if (want.size === 0) return false;
  const have = stems(errorText);
  const found = [...want].filter((s) => [...have].some((h) => h === s || (s.length >= 4 && h.startsWith(s)))).length;
  return found >= Math.min(2, want.size) && found / want.size >= 0.6;
}

/** The known problems an error looks like, best first (candidates come from the full-text search). */
export function knownProblemsFor(errorText: string, candidates: Entity[], limit = 3): KnownProblem[] {
  return candidates
    .map(asKnownProblem)
    .filter((p): p is KnownProblem => !!p && matchesProblem(p, errorText))
    .slice(0, limit);
}

/** What a failed command shows: the end of its error output, where the reason usually is. */
export function errorTail(result: { stderr?: string; stdout?: string }, max = 600): string {
  const text = (result.stderr?.trim() || result.stdout?.trim() || '').replace(/\s+\n/g, '\n');
  return text.length > max ? `…${text.slice(-max)}` : text;
}

/**
 * Problems worth keeping, from a run's command attempts:
 * - a command that failed and, later in the same step, worked: something in between solved it;
 * - a command that failed in a step that ended failed: a problem not solved yet.
 * A failure that matched a known problem is already known. A command that failed once and was
 * not tried again in a step that went on (a check like `test -d`) is not a problem.
 */
export function knowledgeSuggestions(run: { deviations: Deviation[]; steps: Array<{ id: string; label: string; status: string }> }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of run.deviations) {
    if (d.kind !== 'comando' || d.known) continue;
    const step = run.steps.find((s) => s.id === d.step);
    const key = `${d.step}|${d.command}`;
    if (seen.has(key)) continue;
    const where = step ? `o passo ${step.id} (${step.label})` : 'a execução';
    if (d.recovered) {
      seen.add(key);
      out.push(
        `${where} esbarrou em \`${d.command}\` (${d.detail}) e depois passou: registre como problema conhecido, ` +
          'com o sintoma (a mensagem), a causa e o que você fez para passar.',
      );
    } else if (step?.status === 'failed') {
      seen.add(key);
      out.push(
        `${where} falhou em \`${d.command}\` (${d.detail}): entenda a causa e registre como problema conhecido, ` +
          'com a solução se você ou o desenvolvedor souberem (o que é código, o agente de código resolve).',
      );
    }
  }
  return out;
}

/** The known problems a run ran into (by entity id), whether it got past them or not. */
export function problemsIn(run: { deviations: Deviation[] }): Set<string> {
  return new Set(run.deviations.flatMap((d) => (d.problem ? [d.problem] : [])));
}

/**
 * How many runs in a row, from the latest back, ran into this problem: 2 or more is a problem
 * that comes back every time, to be fixed at the root rather than got past again.
 * `runs` are the procedure's finished runs, newest first.
 */
export function recurrence(runs: ReadonlyArray<{ deviations: Deviation[] }>, problem: string): number {
  let n = 0;
  for (const run of runs) {
    if (!problemsIn(run).has(problem)) break;
    n++;
  }
  return n;
}
