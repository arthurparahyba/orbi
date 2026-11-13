import type { CommandEffect, CommandProfile } from './types.ts';
import { git } from './git.ts';
import { gh } from './gh.ts';
import { aws } from './aws.ts';
import { mvn, npm } from './build-tools.ts';
import { cat, find, grep, head, ls, python3, rm, rmdir, tail, wc } from './files.ts';

export type { CommandEffect, CommandProfile } from './types.ts';
export { gitVerbArgs } from './git.ts';

/** Every CLI the Orbi knows something about. A new CLI: a new file, and one entry here. */
export const PROFILES: readonly CommandProfile[] = [git, gh, aws, npm, mvn, cat, head, tail, wc, ls, grep, find, rm, rmdir, python3];

const byBinary = new Map(PROFILES.map((p) => [p.binary, p]));
export const profileOf = (binary: string): CommandProfile | undefined => byBinary.get(binary);

/** Whether a call only reads (an unknown CLI never does). */
export const commandReads = (binary: string, args: readonly string[]) => profileOf(binary)?.reads?.(args) ?? false;

/** What a call does to the world: reading, changing this machine, publishing or deleting. */
export function commandEffectOf(binary: string, args: readonly string[]): 'leitura' | CommandEffect {
  if (commandReads(binary, args)) return 'leitura';
  return profileOf(binary)?.effect?.(args) ?? 'local';
}

/** How to install a CLI on this system, when its profile says. */
export const installHint = (binary: string, platform: string = process.platform) =>
  profileOf(binary)?.install?.[platform as 'darwin' | 'win32' | 'linux'] ?? (platform === 'linux' ? profileOf(binary)?.install?.darwin : undefined);
