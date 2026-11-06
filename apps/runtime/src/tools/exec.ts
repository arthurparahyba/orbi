import { spawn } from 'node:child_process';

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

export class CommandNotAllowedError extends Error {}

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
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value !== undefined) env[key] = value;
  }
  // gh and aws must never open an interactive prompt.
  env.GH_PROMPT_DISABLED = '1';
  env.AWS_PAGER = '';

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
