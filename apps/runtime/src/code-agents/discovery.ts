import { runShell } from '../terminal/exec.ts';
import { shQuote } from '../terminal/shell.ts';
import { KNOWN_BINARIES } from './catalog.ts';

/** What the configuration chat may look at: names of programs, never paths or arguments of its own. */
const NAME = /^[a-z0-9][a-z0-9._-]{0,40}$/i;
const SUBCOMMAND = /^[a-z][a-z0-9-]{0,30}$/i;

export interface Found { binary: string; path: string; version: string | null }

type ShellOpts = { shell: string | null; env: Record<string, string | undefined>; cwd: string };

/**
 * Which coding agents are installed: `command -v` in the developer's shell (the same PATH the
 * agents will run with), then `--version` of each one found. Read-only, a few seconds.
 */
export async function findAgents(opts: ShellOpts, extra: readonly string[] = []): Promise<{ found: Found[]; missing: string[] }> {
  if (!opts.shell) throw new Error('nenhum shell encontrado (Git Bash no Windows): configure o caminho do bash.exe');
  const names = [...new Set([...KNOWN_BINARIES, ...extra])].filter((n) => NAME.test(n));
  const run = (line: string, timeoutMs: number) => runShell(opts.shell!, line, { cwd: opts.cwd, env: opts.env, shell: opts.shell, timeoutMs, inherit: 'developer' });
  const located = await run(names.map((n) => `p=$(command -v ${shQuote(n)}) && echo ${shQuote(n)}=$p`).join('; ') + '; true', 20_000);
  const found: Found[] = [];
  for (const line of located.stdout.split('\n')) {
    const at = line.indexOf('=');
    if (at < 1) continue;
    const binary = line.slice(0, at).trim();
    if (!names.includes(binary)) continue;
    const v = await run(`${shQuote(binary)} --version`, 15_000).catch(() => null);
    const version = v && v.exitCode === 0 ? (v.stdout || v.stderr).trim().split('\n')[0]?.slice(0, 120) ?? null : null;
    found.push({ binary, path: line.slice(at + 1).trim(), version });
  }
  return { found, missing: names.filter((n) => !found.some((f) => f.binary === n)) };
}

/**
 * The `--help` of an installed agent (or of one subcommand, e.g. `codex exec --help`): how to run
 * it once, how to pass the model, and sometimes which models exist. Read-only, cut to `max`.
 */
export async function agentHelp(opts: ShellOpts, binary: string, subcommand?: string, max = 8_000): Promise<string> {
  if (!opts.shell) throw new Error('nenhum shell encontrado (Git Bash no Windows)');
  if (!NAME.test(binary)) throw new Error(`nome de programa inválido: ${binary}`);
  if (subcommand && !SUBCOMMAND.test(subcommand)) throw new Error(`subcomando inválido: ${subcommand}`);
  const line = [shQuote(binary), ...(subcommand ? [shQuote(subcommand)] : []), '--help'].join(' ');
  const r = await runShell(opts.shell, line, { cwd: opts.cwd, env: opts.env, shell: opts.shell, timeoutMs: 20_000, inherit: 'developer' });
  const text = `${r.stdout}\n${r.stderr}`.trim();
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} caracteres cortados)` : text;
}
