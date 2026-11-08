import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { defineTool, useTool } from '@flue/runtime';
import * as v from 'valibot';
import { ulid } from 'ulidx';
import { services } from '../../services.ts';
import { runCommand } from '../../terminal/exec.ts';
import { commandCategory, commandEffect } from '../../autonomy/policy.ts';
import { homedir } from 'node:os';
import type { AgentContext } from '../context.ts';

/** Terminal: git, gh, aws and python3, without a shell, inside the workspace. */

function insideWorkspace(cwd?: string): string {
  const { workspace } = services().config;
  const dir = cwd ? (isAbsolute(cwd) ? cwd : resolve(workspace, cwd)) : workspace;
  const rel = relative(workspace, dir);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`cwd fora do workspace: ${cwd}`);
  return dir;
}

async function execCommand(args: { binary: string; args: string[]; cwd?: string; timeoutSeconds?: number }, signal?: AbortSignal) {
  const { config } = services();
  const result = await runCommand(args.binary, args.args, {
    cwd: insideWorkspace(args.cwd),
    timeoutMs: Math.min(args.timeoutSeconds ?? 120, 1800) * 1000,
    env: config.cliEnv,
    allowed: config.allowedBinaries,
    signal,
  });
  return JSON.stringify(result);
}

const commandInput = v.object({
  binary: v.pipe(v.string(), v.description('An allowed CLI: git, gh, aws or python3 unless the developer configured others')),
  args: v.array(v.string()),
  cwd: v.optional(v.pipe(v.string(), v.description('Folder relative to the workspace, e.g. the repo name'))),
  timeoutSeconds: v.optional(v.number()),
  purpose: v.pipe(v.string(), v.description('One line: why you run this. Shown to the developer.')),
});

/** Read-only command runner for subagents (they cannot hold approvals). */
export const runReadOnlyCommand = defineTool({
  name: 'run_readonly_command',
  description: 'Run a read-only CLI command (git log/diff/status, gh run view/list, aws logs tail, describe/get/list…). No shell. Write commands are refused.',
  input: commandInput,
  timeoutMs: 600_000,
  async run({ data, signal }) {
    if (commandCategory(data.binary, data.args) !== 'comandos-leitura') {
      return { output: { refused: 'Comando de escrita. Devolva ao agente principal o que precisa ser feito.' } };
    }
    return { output: await execCommand(data, signal) };
  },
});

export const runPython = defineTool({
  name: 'run_python',
  description:
    'Run a short Python 3 script for investigation (parse logs, compare files, compute). Runs in its own empty folder, ' +
    'with no environment variables or home folder of the user (no credentials), 60 s limit. Pass data inside the code.',
  input: v.object({ code: v.string(), purpose: v.string() }),
  timeoutMs: 90_000,
  async run({ data, signal }) {
    // One empty folder per run, which is also HOME and TMPDIR: the script sees nothing of
    // the user's session (~/.aws, ~/.config/gh, tokens in the environment) and leaves nothing behind.
    const dir = join(services().config.scratchDir, `py-${ulid()}`);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, 'script.py'), data.code);
      const result = await runCommand('python3', ['-I', 'script.py'], {
        cwd: dir,
        timeoutMs: 60_000,
        signal,
        allowed: ['python3'],
        inherit: 'minimal',
        env: { HOME: dir, TMPDIR: dir, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' },
      });
      return { output: JSON.stringify(result) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
});

/** One line for the card: the home folder as ~, long arguments (inline scripts) cut. */
export function shortCommand(binary: string, args: readonly string[], home = homedir()): string {
  const parts = args.map((a) => {
    const short = home && a.includes(home) ? a.split(home).join('~') : a;
    const one = short.replace(/\s+/g, ' ');
    const shown = one.length > 80 ? `${one.slice(0, 77)}…` : one;
    return /[\s"']/.test(shown) ? `"${shown.replace(/"/g, '\\"')}"` : shown;
  });
  return [binary, ...parts].join(' ');
}

export function useTerminal(ctx: AgentContext) {
  const { allowedBinaries } = services().config;
  ctx.gated({
    name: 'run_command',
    description: `Run a CLI command in the workspace — ${allowedBinaries.join(', ')} — without a shell (binary + args). Read-only commands usually run at once; writes (push, merge, workflow run, deploy) follow the autonomy rules.`,
    input: commandInput,
    category: (a) => commandCategory(a.binary, a.args),
    summary: (a) => `${a.purpose}: ${a.binary} ${a.args.join(' ')}`,
    title: (a) => a.purpose,
    command: (a) => shortCommand(a.binary, a.args),
    effect: (a) => commandEffect(a.binary, a.args),
    fingerprint: (a) => `run_command ${a.binary} ${a.args.join(' ')}${a.cwd ? ` (em ${a.cwd})` : ''}`,
    execute: (a) => execCommand(a),
    timeoutMs: 1_800_000,
  });
  useTool(runPython);
}
