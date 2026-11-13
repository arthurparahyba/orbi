/**
 * Autonomy that grows with use. Each playbook has a level:
 *   1 · Aprendendo  asks before every action that changes something
 *   2 · Assistido   repeats on its own what already worked (local effects); asks what is new
 *                   and what publishes outside
 *   3 · Autônomo    repeats everything that already worked, publishing included; asks only what is new
 * An action is "known" when the same action (its fingerprint) ran in an earlier run of the same
 * playbook that finished without deviation. Pure rules; the store keeps the state.
 */

export type Level = 1 | 2 | 3;
/** Who set the current level: learned (new), promoted/demoted by use, or the developer. */
export type LevelBy = 'learned' | 'promoted' | 'demoted' | 'user';
/** What an action does to the world, for deciding and for the approval card. */
export type Effect = 'leitura' | 'local' | 'publica' | 'apaga';

export const LEVEL_NAMES: Record<Level, string> = { 1: 'N1 · Aprendendo', 2: 'N2 · Assistido', 3: 'N3 · Autônomo' };
/** Clean runs at N2 needed to reach N3 (one clean run takes N1 to N2). */
export const RUNS_FOR_N3 = 3;
/** Times the developer let an esteira's passage go on before it goes on by itself. */
export const PASSAGE_STREAK = 3;

export interface RunAction {
  fingerprint: string;
  tool: string;
  effect: Effect;
  /** One line, for the Cérebro screen. */
  summary: string;
  step: string | null;
}

export interface Deviation {
  /** `comando`: a command that exited with an error. Not a problem by itself (a check may exit 1
   * on purpose): it only feeds what the Orbi learns (domain/knowledge.ts), never the level. */
  /** `intervencao`: the developer typed something during the run (often a correction): it may scope a change, never the level. */
  /** `chamada`: the model called a tool wrongly (invalid arguments, a tool that does not exist): the model's slip, never the step's fault nor the level's. */
  kind: 'falha' | 'negado' | 'passo' | 'comando' | 'intervencao' | 'chamada';
  detail: string;
  /** For `comando`: the command as run, to tell when the same one worked later. */
  command?: string;
  /** For `comando`: the error matched a known problem of the brain. */
  known?: boolean;
  /** The known problem the error matched (its entity id): to count how often it comes back. */
  problem?: string;
  tool?: string;
  step?: string | null;
  at: string;
  /** A failure the same step got past right away (the same tool worked next): not a problem. */
  recovered?: boolean;
}

/** The deviations that count: a slip fixed on the spot does not. */
export const activeDeviations = (deviations: Deviation[]) => deviations.filter((d) => !d.recovered && d.kind !== 'comando' && d.kind !== 'intervencao' && d.kind !== 'chamada');

/** Whether a step's instruction names this tool (the step is about it). */
export const stepUses = (how: string | undefined, tool: string): boolean => !!how && how.includes(tool);

/** A tool error that is a wrong call (arguments that do not validate, a tool that does not exist), not the tool failing at its work. */
export const isCallError = (error: string | undefined): boolean => !!error && /^Validation failed for tool|^Tool .{1,80} not found|^Unknown tool|ferramenta .{1,80} não existe/i.test(error.trim());

export interface LevelState {
  level: Level;
  levelMax: Level;
  levelBy: LevelBy;
  cleanStreak: number;
}

export interface LevelChange {
  from: Level;
  to: Level;
  reason: string;
}

/**
 * What the autonomy gate does with one action of a running playbook (after the global rules:
 * observe and the categories that always follow the global level are decided before).
 */
export function decideAction(pb: { level: Level; levelBy: LevelBy }, action: { known: boolean; effect: Effect }): 'auto' | 'ask' {
  if (action.effect === 'leitura') return 'auto';
  const trusted = pb.level === 3 && pb.levelBy === 'user';
  // Deleting never runs alone unless the developer put the playbook at N3 and it already did it.
  if (action.effect === 'apaga') return trusted && action.known ? 'auto' : 'ask';
  // The developer set N3 by hand: trust it as before, new actions included.
  if (trusted) return 'auto';
  if (!action.known) return 'ask';
  if (pb.level === 3) return 'auto';
  if (pb.level === 2) return action.effect === 'local' ? 'auto' : 'ask';
  return 'ask';
}

/** Why the card asks, in a short line. */
export function askReason(pb: { level: Level; name: string }, action: { known: boolean; effect: Effect }): string {
  if (action.effect === 'apaga') return 'apagar sempre pergunta';
  if (!action.known) return pb.level === 1 ? `${pb.name} está no N1` : 'ação nova neste procedimento';
  if (pb.level === 2 && action.effect === 'publica') return `${pb.name} está no N2 e isto publica para fora`;
  return `${pb.name} está no N${pb.level}`;
}

/**
 * A failure the brain already knew, in a step that went on and ended well: the Orbi applied the
 * known solution. It is not a problem of the procedure, so it does not hold the level back; if
 * it keeps coming back, the review proposes fixing it at the root (domain/judge.ts).
 */
export function workedAround(d: Deviation, steps: ReadonlyArray<{ id: string; status: string }>): boolean {
  return !!d.problem && (d.kind === 'falha' || d.kind === 'comando') && steps.some((s) => s.id === d.step && s.status === 'done');
}

/** A run's problems that keep it from counting toward the next level. */
export function runDeviations(run: { status: string; steps: Array<{ id: string; status: string }>; deviations: Deviation[] }): string[] {
  const out = activeDeviations(run.deviations).filter((d) => !workedAround(d, run.steps)).map((d) => d.detail);
  if (run.status === 'failed') out.push('a execução falhou');
  for (const s of run.steps) if (s.status === 'failed' || s.status === 'skipped') out.push(`passo ${s.id} ${s.status === 'failed' ? 'falhou' : 'foi pulado'}`);
  return out;
}

/** After a run ends: the next level state, and the change if the level moved. */
export function settleLevel(state: LevelState, outcome: { clean: boolean; denied: boolean; failed: boolean }): { state: LevelState; change: LevelChange | null } {
  if (!outcome.clean) {
    const down = (outcome.failed || outcome.denied) && state.level > 1;
    const to = (down ? state.level - 1 : state.level) as Level;
    const reason = outcome.denied ? 'você negou uma ação' : outcome.failed ? 'a execução falhou' : '';
    return {
      state: { ...state, level: to, levelBy: down ? 'demoted' : state.levelBy, cleanStreak: 0 },
      change: down ? { from: state.level, to, reason } : null,
    };
  }
  const streak = state.cleanStreak + 1;
  if (state.level === 1 && state.levelMax >= 2) {
    return { state: { ...state, level: 2, levelBy: 'promoted', cleanStreak: 0 }, change: { from: 1, to: 2, reason: 'rodou de ponta a ponta sem correção' } };
  }
  if (state.level === 2 && state.levelMax >= 3 && streak >= RUNS_FOR_N3) {
    return { state: { ...state, level: 3, levelBy: 'promoted', cleanStreak: 0 }, change: { from: 2, to: 3, reason: `${RUNS_FOR_N3} execuções seguidas sem desvio no N2` } };
  }
  return { state: { ...state, cleanStreak: streak }, change: null };
}

/** Editing the steps takes the playbook one level down: what it knew may not hold. */
export function levelAfterEdit(state: LevelState): { state: LevelState; change: LevelChange | null } {
  if (state.level === 1) return { state: { ...state, cleanStreak: 0 }, change: null };
  const to = (state.level - 1) as Level;
  return { state: { ...state, level: to, levelBy: 'demoted', cleanStreak: 0 }, change: { from: state.level, to, reason: 'os passos foram editados' } };
}

/**
 * The action with this run's parameter values put back as {{name}}: the same command with
 * another version or repository is the same action.
 */
export function fingerprintWith(raw: string, params: Record<string, string>): string {
  let out = raw.replace(/\s+/g, ' ').trim();
  const values = Object.entries(params)
    .filter(([, value]) => value && value.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [name, value] of values) out = out.split(value).join(`{{${name}}}`);
  return out;
}

/** The default fingerprint of a tool call: its name and arguments, without the free-text purpose. */
export function defaultFingerprint(tool: string, args: Record<string, unknown>): string {
  const { purpose: _p, reason: _r, ...rest } = args;
  return `${tool} ${JSON.stringify(rest, Object.keys(rest).sort())}`;
}
