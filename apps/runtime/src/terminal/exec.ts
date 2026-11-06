import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

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

const INSTALL_HINT: Record<string, string> = {
  gh: 'instale com `brew install gh` e rode `gh auth login`',
  aws: 'instale com `brew install awscli` e configure com `aws configure` ou `aws sso login`',
  git: 'no macOS vem com `xcode-select --install`',
  python3: 'no macOS vem com `xcode-select --install` (ou `brew install python`)',
};

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
  return Object.fromEntries(binaries.map((b) => [b, findBinary(b)]));
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

export function runCommand(binary: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  assertAllowed(binary, args, options.allowed);
  const { cwd, timeoutMs = 120_000, signal, maxOutput = 20_000 } = options;

  const env: Record<string, string> = {};
  for (const key of options.inherit === 'minimal' ? MINIMAL_ENV_KEYS : SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value !== undefined) env[key] = value;
  }
  // gh and aws must never open an interactive prompt.
  env.GH_PROMPT_DISABLED = '1';
  env.AWS_PAGER = '';

  // spawn() reports a missing binary AND a missing cwd as the same ENOENT; tell them apart.
  if (cwd && !existsSync(cwd)) {
    return Promise.reject(new Error(`a pasta onde o comando rodaria não existe: ${cwd} (confira ORBI_WORKSPACE no .env)`));
  }
  if (!findBinary(binary, env.PATH)) {
    const hint = INSTALL_HINT[binary] ? `; ${INSTALL_HINT[binary]}` : '';
    return Promise.reject(new CommandNotFoundError(`\`${binary}\` não está instalado ou não está no PATH do Orbi${hint}`));
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
        command: [binary, ...args].join(' '),
        exitCode,
        stdout: out.text,
        stderr: err.text,
        timedOut,
        truncated: out.clipped || err.clipped,
      });
    });
  });
}
