import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { gitToolDirs, shellLine } from './shell.ts';
import { installHint } from '../commands/index.ts';

/**
 * The only way Orbi runs programs. No shell is involved: arguments go straight
 * to the binary, so a model-supplied string can never become `; rm -rf`.
 */
export const DEFAULT_BINARIES = ['git', 'gh', 'aws', 'python3'];

export interface RunOptions {
  /** Binaries this call may use. Defaults to DEFAULT_BINARIES. */
  allowed?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** Max characters kept from stdout and from stderr. */
  maxOutput?: number;
  /**
   * 'safe' (default) passes PATH, HOME, locale and a few more from the runtime;
   * 'minimal' passes only PATH and locale, so nothing of the user's session
   * (HOME and its credential files, tokens) is visible: callers set the rest.
   */
  inherit?: 'safe' | 'minimal';
  /**
   * The developer's shell (shell.ts), when there is one: on Windows it runs the programs
   * that only exist as .cmd (npm, mvn), and Git's own tools (cat, cp) join the PATH.
   */
  shell?: string | null;
}

export interface RunResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

const SAFE_ENV_KEYS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'SHELL', 'TERM'];
const MINIMAL_ENV_KEYS = ['PATH', 'LANG', 'LC_ALL'];

export class CommandNotAllowedError extends Error {}
/** The binary isn't installed, or isn't on the PATH the runtime got. */
export class CommandNotFoundError extends Error {}
/** The program needs the developer's shell (a .cmd on Windows) and none was found. */
export class ShellNeededError extends CommandNotFoundError {}

export { installHint } from '../commands/index.ts';

/**
 * The program that runs `binary`. On Windows `python3` usually does not exist (it is
 * `python` or the `py` launcher), and the `python*.exe` in WindowsApps are Store shortcuts
 * that open the Store instead of running: they are skipped.
 */
export function resolveBinary(binary: string, pathVar = process.env.PATH ?? '', platform: string = process.platform): { file: string; prefix: string[] } | null {
  if (platform !== 'win32' || binary !== 'python3') {
    const file = findBinary(binary, pathVar);
    return file ? { file, prefix: [] } : null;
  }
  const real = pathVar.split(delimiter).filter((d) => d && !/WindowsApps/i.test(d)).join(delimiter);
  for (const [name, prefix] of [['python', []], ['py', ['-3']], ['python3', []]] as const) {
    const file = findBinary(name, real);
    if (file) return { file, prefix: [...prefix] };
  }
  return null;
}

/** Where `binary` would be found on `pathVar`, or null. Mirrors what spawn() does. */
export function findBinary(binary: string, pathVar = process.env.PATH ?? ''): string | null {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, binary + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

export function binaryStatus(binaries: readonly string[] = DEFAULT_BINARIES): Record<string, string | null> {
  return Object.fromEntries(binaries.map((b) => [b, resolveBinary(b)?.file ?? null]));
}

export function assertAllowed(binary: string, args: readonly string[], allowed: readonly string[] = DEFAULT_BINARIES): void {
  if (!allowed.includes(binary) || binary.includes('/')) {
    throw new CommandNotAllowedError(`binary not allowed: ${binary}`);
  }
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) {
      throw new CommandNotAllowedError('invalid argument');
    }
  }
}

function clip(text: string, max: number): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const head = Math.floor(max * 0.3);
  const tail = max - head;
  return {
    text: `${text.slice(0, head)}\n…[${text.length - max} caracteres omitidos]…\n${text.slice(-tail)}`,
    clipped: true,
  };
}

function buildEnv(options: RunOptions): Record<string, string> {
  const env: Record<string, string> = {};
  // Windows spells it Path; the rest of this file reads PATH.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  for (const key of options.inherit === 'minimal' ? MINIMAL_ENV_KEYS : SAFE_ENV_KEYS) {
    const value = process.env[key === 'PATH' ? pathKey : key];
    if (value) env[key] = value;
  }
  if (process.platform === 'win32') {
    for (const key of ['SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'TEMP', 'TMP']) {
      if (process.env[key]) env[key] = process.env[key]!;
    }
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value !== undefined) env[key] = value;
  }
  const extra = gitToolDirs(options.shell ?? null).filter((d) => !(env.PATH ?? '').split(delimiter).includes(d));
  if (extra.length) env.PATH = [env.PATH, ...extra].filter(Boolean).join(delimiter);
  // gh and aws must never open an interactive prompt.
  env.GH_PROMPT_DISABLED = '1';
  env.AWS_PAGER = '';
  // Git Bash's login profile would otherwise cd to HOME instead of staying in cwd.
  env.CHERE_INVOKING = '1';
  return env;
}

/**
 * A line of shell the developer approved (run_shell): pipes, &&, a team's script. Unlike
 * runCommand, the shell interprets it: only the gate (always asking for new lines) protects it.
 */
export function runShell(shell: string, line: string, options: RunOptions = {}): Promise<RunResult> {
  if (line.includes('\0')) return Promise.reject(new CommandNotAllowedError('invalid argument'));
  const { cwd } = options;
  if (cwd && !existsSync(cwd)) {
    return Promise.reject(new Error(`a pasta onde o comando rodaria não existe: ${cwd} (confira ORBI_WORKSPACE no .env)`));
  }
  return collect(shell, ['-lc', line], line, buildEnv(options), options);
}

export function runCommand(binary: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  assertAllowed(binary, args, options.allowed);
  const { cwd } = options;
  const env = buildEnv(options);

  // spawn() reports a missing binary AND a missing cwd as the same ENOENT; tell them apart.
  if (cwd && !existsSync(cwd)) {
    return Promise.reject(new Error(`a pasta onde o comando rodaria não existe: ${cwd} (confira ORBI_WORKSPACE no .env)`));
  }
  const program = resolveBinary(binary, env.PATH);
  if (!program) {
    const hint = installHint(binary) ? `; ${installHint(binary)}` : '';
    return Promise.reject(new CommandNotFoundError(`\`${binary}\` não está instalado ou não está no PATH do Orbi${hint}`));
  }

  // npm, mvn, npx… are .cmd on Windows, which Node will not start without a shell: through
  // the developer's shell, every argument quoted (nothing in them is interpreted).
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(program.file)) {
    if (!options.shell) {
      return Promise.reject(new ShellNeededError(`\`${binary}\` no Windows é um .cmd e precisa do Git Bash para rodar`));
    }
    return collect(options.shell, ['-lc', shellLine(binary, args)], [binary, ...args].join(' '), env, options);
  }
  return collect(program.file, [...program.prefix, ...args], [binary, ...args].join(' '), env, options);
}

function collect(file: string, args: readonly string[], shown: string, env: Record<string, string>, options: RunOptions): Promise<RunResult> {
  const { cwd, timeoutMs = 120_000, signal, maxOutput = 20_000 } = options;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const out = clip(stdout, maxOutput);
      const err = clip(stderr, maxOutput);
      resolvePromise({
        command: shown,
        exitCode,
        stdout: out.text,
        stderr: err.text,
        timedOut,
        truncated: out.clipped || err.clipped,
      });
    });
  });
}
