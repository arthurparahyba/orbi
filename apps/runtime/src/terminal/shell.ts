import { existsSync } from 'node:fs';
import { platformFor } from '../platform/index.ts';

/**
 * The developer's shell (Git Bash on Windows, bash elsewhere). Orbi runs programs without a
 * shell (exec.ts); the shell is used for two things only:
 *  - programs that Windows only ships as .cmd (npm, mvn, npx…), which Node cannot start
 *    without a shell: they run as `bash -lc "npm 'arg' …"`, every argument quoted;
 *  - `run_shell`, a line of shell the developer approves (pipes, &&, a team's .sh script).
 * ORBI_SHELL picks a shell by path, or turns it off (`off`).
 */
export function findShell(env: NodeJS.ProcessEnv, platform: string = process.platform, exists: (p: string) => boolean = existsSync): string | null {
  const chosen = env.ORBI_SHELL?.trim();
  if (chosen === 'off') return null;
  if (chosen) return exists(chosen) ? chosen : null;
  return platformFor(platform).shellCandidates(env).find((c) => exists(c)) ?? null;
}

/**
 * Git for Windows' own tools (cat, cp, mkdir, grep… in usr\bin): added to the PATH of commands,
 * so they run without a shell even when the app was opened from the Start menu.
 */
export function gitToolDirs(shell: string | null, platform: string = process.platform): string[] {
  return shell ? platformFor(platform).shellToolDirs(shell) : [];
}

/** One argument for a POSIX shell: in single quotes, so nothing in it is interpreted. */
export const shQuote = (arg: string) => `'${arg.replace(/'/g, `'\\''`)}'`;

/** `npm 'install' 'it'\''s'`: a program and its arguments as one safe shell line. */
export const shellLine = (binary: string, args: readonly string[]) => [binary, ...args.map(shQuote)].join(' ');

/**
 * What a shell line does to the world, as far as the text tells: deleting (rm, rmdir, git push
 * --force, gh … delete…) is `apaga`; anything else may publish (a line can call anything).
 */
export function shellEffect(line: string): 'apaga' | 'publica' {
  const destructive =
    /(^|[\s;&|(])(rm|rmdir|del|rd|shred|truncate)\s/i.test(line) ||
    /git\s+(push\s+[^;&|]*(--force|-f\b|--delete|-d\b|\s:)|clean\b|reset\s+--hard|branch\s+-D)/.test(line) ||
    /\b(gh|aws)\b[^;&|]*\b(delete|terminate|remove|deregister)/.test(line) ||
    /\bdrop\s+(table|database)\b/i.test(line);
  return destructive ? 'apaga' : 'publica';
}
