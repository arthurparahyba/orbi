import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulidx';
import { platform } from '../platform/index.ts';
import { shQuote } from '../terminal/shell.ts';
import { developerEnv } from '../terminal/orbi-env.ts';
import type { RunResult } from '../terminal/exec.ts';

/**
 * Runs a coding agent in a terminal window the developer sees, like one they open by hand: the
 * agent gets their own session (its login works as in their terminal) and they follow what it
 * does. The window runs a small script that tees the output to a file and writes the exit code
 * when done; the Orbi waits for that file. The window stays open afterwards, to be read.
 */
export interface WindowRun {
  /** The agent's command line, as it would be typed. */
  line: string;
  cwd: string;
  /** Shown in the window: what the Orbi asked. */
  title: string;
  /** Where the script, its log and its exit code go. */
  scratchDir: string;
  /** The developer's shell (Git Bash on Windows): the window runs the script with it. */
  shell: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** For tests: opens the "window" (default: the platform's terminal). */
  open?: (script: string) => void;
  pollMs?: number;
}

/** Paths as the script's bash reads them (C:/Users/… on Windows). */
const forBash = (p: string) => p.replace(/\\/g, '/');

export function windowScript(run: { line: string; cwd: string; title: string; log: string; done: string }): string {
  return [
    '#!/bin/bash',
    `printf '\\033]0;%s\\007' ${shQuote(`Orbi · ${run.title}`)}`,
    `cd ${shQuote(forBash(run.cwd))} || exit 1`,
    `echo ${shQuote(`Orbi pediu: ${run.title}`)}`,
    `echo ${shQuote(`Pasta: ${forBash(run.cwd)}`)}`,
    'echo',
    // In braces: everything the line prints, errors included, goes to the window and to the log.
    `{ ${run.line}\n} 2>&1 | tee ${shQuote(forBash(run.log))}`,
    'code=${PIPESTATUS[0]}',
    `echo "$code" > ${shQuote(forBash(run.done))}`,
    'echo',
    'echo "Terminado (saída $code). O Orbi já recebeu o resultado; pode fechar esta janela."',
    '',
  ].join('\n');
}

export async function runInTerminalWindow(run: WindowRun): Promise<RunResult> {
  const dir = join(run.scratchDir, 'agent-windows', ulid().toLowerCase());
  mkdirSync(dir, { recursive: true });
  const script = join(dir, 'run.command'); // .command: macOS opens it in Terminal
  const log = join(dir, 'saida.log');
  const done = join(dir, 'fim');
  writeFileSync(script, windowScript({ line: run.line, cwd: run.cwd, title: run.title, log, done }));
  chmodSync(script, 0o755);

  if (run.open) run.open(script);
  else {
    const launch = platform().terminalWindow(script, run.shell, developerEnv());
    if (!launch) throw new Error('não achei um terminal para abrir nesta máquina; mude o agente para rodar em segundo plano');
    const child = spawn(launch.command, launch.args, { detached: true, stdio: 'ignore', env: launch.env ?? developerEnv() });
    child.on('error', () => {});
    child.unref();
  }

  const started = Date.now();
  const limit = run.timeoutMs ?? 1_200_000;
  while (!existsSync(done)) {
    if (run.signal?.aborted) return { command: run.line, exitCode: null, stdout: readLog(log), stderr: 'cancelado', timedOut: false, truncated: false };
    if (Date.now() - started > limit) return { command: run.line, exitCode: null, stdout: readLog(log), stderr: 'a janela do terminal não terminou no tempo', timedOut: true, truncated: false };
    await new Promise((r) => setTimeout(r, run.pollMs ?? 1000));
  }
  const exitCode = Number(readFileSync(done, 'utf8').trim());
  const out = readLog(log);
  return { command: run.line, exitCode: Number.isFinite(exitCode) ? exitCode : null, stdout: out, stderr: exitCode === 0 ? '' : out.slice(-2000), timedOut: false, truncated: false };
}

function readLog(file: string): string {
  try {
    return readFileSync(file, 'utf8').slice(-50_000);
  } catch {
    return '';
  }
}
