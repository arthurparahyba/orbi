import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Settings the developer changes from the app (e.g. where Git Bash is) are written to the same
 * `.env` the runtime reads at start, so they stay after a restart and after an update (the
 * installed app keeps its .env in its own folder, outside the program).
 */

/** The .env text with `key` set to `value` (replaced where it was, else added at the end). */
export function withEnvValue(text: string, key: string, value: string): string {
  // Single quotes: taken literally, so Windows paths keep their backslashes.
  const line = `${key}='${value.replace(/'/g, '')}'`;
  const re = new RegExp(`^\\s*#?\\s*${key}\\s*=.*$`, 'm');
  // Replace an active line first; else a commented example; else append.
  const active = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (active.test(text)) return text.replace(active, line);
  if (re.test(text)) return text.replace(re, line);
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
}

export function setEnvValue(file: string, key: string, value: string): void {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, withEnvValue(text, key, value));
}
