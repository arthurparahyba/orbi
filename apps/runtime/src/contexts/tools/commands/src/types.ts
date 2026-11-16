/**
 * What the Orbi knows about one CLI: which calls only read, what the others do to the world,
 * and how to install it. One file per CLI (git.ts, gh.ts…), listed in index.ts: a new CLI is a
 * new file, nothing else changes (the autonomy policy and the terminal only look profiles up).
 * Generic CLI knowledge, never the user's domain.
 */
export type CommandEffect = 'local' | 'publica' | 'apaga';

export interface CommandProfile {
  binary: string;
  /** True when these arguments only read. Absent: every call writes. */
  reads?(args: readonly string[]): boolean;
  /** What a call that writes does. Absent: `local` (changes this machine only). */
  effect?(args: readonly string[]): CommandEffect;
  /** How to install it, per system. */
  install?: { darwin?: string; win32?: string; linux?: string };
}
