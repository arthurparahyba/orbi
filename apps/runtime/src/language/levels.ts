/**
 * Autonomy vocabulary: the level a procedure sits at, the effect an action has, and the shapes
 * the runtime passes around. Words only — the rules that use them are in the `trust` context
 * (documento 26: `language/` has no state and no database).
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
