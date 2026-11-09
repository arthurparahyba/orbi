import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { defineTool, useTool } from '@flue/runtime';
import * as v from 'valibot';
import { ulid } from 'ulidx';
import { services } from '../../services.ts';
import { ShellNeededError, runCommand, runShell } from '../../terminal/exec.ts';
import { askShellPath } from './shell-setup.ts';
import type { UiComponent } from '@orbi/contracts';
import { shellEffect } from '../../terminal/shell.ts';
import { commandCategory, commandEffect } from '../../autonomy/policy.ts';
import { homedir } from 'node:os';
import type { AgentContext } from '../context.ts';
import { errorTail } from '../../brain/domain/knowledge.ts';

/** Terminal: git, gh, aws and python3, without a shell, inside the workspace. */

function insideWorkspace(cwd?: string): string {
  const { workspace } = services().config;
  const dir = cwd ? (isAbsolute(cwd) ? cwd : resolve(workspace, cwd)) : workspace;
  const rel = relative(workspace, dir);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`cwd fora do workspace: ${cwd}`);
  return dir;
}

/** Where `saveTo` writes: an absolute path, `~/…`, or a path relative to the workspace. */
export function savePath(saveTo: string, workspace: string, home = homedir()): string {
  if (saveTo.startsWith('~/')) return join(home, saveTo.slice(2));
  return isAbsolute(saveTo) ? saveTo : resolve(workspace, saveTo);
}

/**
 * After a command ran inside a procedure: the attempt goes to the run's trail (what fails and
 * later passes becomes knowledge), and a failure brings the known problems it looks like, so
 * the Orbi knows what to do without remembering to look (domain/knowledge.ts).
 */
export function afterCommand(conversationId: string, command: string, result: { exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean }) {
  const { brain } = services();
  const failed = result.exitCode !== 0 || !!result.timedOut;
  const error = failed ? errorTail(result) : '';
  const known = failed ? brain.knownProblems(`${command}\n${error}`) : [];
  brain.noteCommand(conversationId, { command, exitCode: result.timedOut ? null : result.exitCode, error, known: known.length > 0 });
  if (!known.length) return {};
  return {
    knownProblems: known.map((p) => ({ id: p.id, sintoma: p.sintoma, ...(p.causa ? { causa: p.causa } : {}), solucao: p.solucao, ...(p.onde ? { onde: p.onde } : {}) })),
    hint: 'Problema conhecido no cérebro: siga a solução dele antes de investigar do zero.',
  };
}

async function execCommand(args: { binary: string; args: string[]; cwd?: string; timeoutSeconds?: number; saveTo?: string }, conversationId: string, signal?: AbortSignal, ui?: (c: UiComponent) => void) {
  const { config } = services();
  const save = args.saveTo ? savePath(args.saveTo, config.workspace) : undefined;
  const result = await runCommand(args.binary, args.args, {
    cwd: insideWorkspace(args.cwd),
    timeoutMs: Math.min(args.timeoutSeconds ?? 120, 1800) * 1000,
    env: config.cliEnv,
    allowed: config.allowedBinaries,
    shell: config.shell,
    signal,
    // The whole output goes to the file; only a summary comes back to the model.
    ...(save ? { maxOutput: 50_000_000 } : {}),
  });
  const extra = afterCommand(conversationId, shortCommand(args.binary, args.args), result);
  if (!save) return JSON.stringify({ ...result, ...extra });
  const ok = result.exitCode === 0 && !result.timedOut;
  if (ok) {
    mkdirSync(dirname(save), { recursive: true });
    writeFileSync(save, result.stdout);
  }
  const lines = result.stdout.split('\n').filter((l) => l.length > 0);
  return JSON.stringify({
    command: result.command,
    exitCode: result.exitCode,
    savedTo: ok ? save : null,
    lines: lines.length,
    bytes: Buffer.byteLength(result.stdout),
    head: lines.slice(0, 5),
    stderr: result.stderr.slice(0, 2000),
    timedOut: result.timedOut,
    ...extra,
  });
}

const commandInput = v.object({
  binary: v.pipe(v.string(), v.description('An allowed CLI: git, gh, aws or python3 unless the developer configured others')),
  args: v.array(v.string()),
  cwd: v.optional(v.pipe(v.string(), v.description('Folder relative to the workspace, e.g. the repo name'))),
  timeoutSeconds: v.optional(v.number()),
  saveTo: v.optional(v.pipe(v.string(), v.description('Write the whole output to this file (absolute, ~/… or relative to the workspace) instead of returning it: you get the path, the line count and the first lines. Use it for lists and big outputs another step reads.'))),
  purpose: v.pipe(v.string(), v.description('One line: why you run this. Shown to the developer.')),
});

/** Read-only command runner for subagents (they cannot hold approvals). */
export const runReadOnlyCommand = defineTool({
  name: 'run_readonly_command',
  description: 'Run a read-only CLI command (git log/diff/status, gh run view/list, aws logs tail, describe/get/list…). No shell. Write commands are refused.',
  input: commandInput,
  timeoutMs: 600_000,
  async run({ data, signal }) {
    if (data.saveTo || commandCategory(data.binary, data.args) !== 'comandos-leitura') {
      return { output: { refused: 'Comando de escrita. Devolva ao agente principal o que precisa ser feito.' } };
    }
    // Subagents have no procedure of their own: no trail, but the known problems still come.
    return { output: await execCommand(data, '', signal) };
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
  const { allowedBinaries, ...config } = services().config;
  ctx.gated({
    name: 'run_command',
    description: `Run a CLI command in the workspace — ${allowedBinaries.join(', ')} — without a shell (binary + args). Read-only commands usually run at once; writes (push, merge, workflow run, deploy) follow the autonomy rules.`,
    input: commandInput,
    // Saving the output writes a file: never a plain read.
    category: (a) => (a.saveTo ? 'comandos-escrita' : commandCategory(a.binary, a.args)),
    summary: (a) => `${a.purpose}: ${a.binary} ${a.args.join(' ')}`,
    title: (a) => a.purpose,
    command: (a) => `${shortCommand(a.binary, a.args)}${a.saveTo ? ` > ${shortCommand('', [a.saveTo]).trim()}` : ''}`,
    effect: (a) => {
      const e = commandEffect(a.binary, a.args);
      return a.saveTo && e === 'leitura' ? 'local' : e;
    },
    fingerprint: (a) => `run_command ${a.binary} ${a.args.join(' ')}${a.cwd ? ` (em ${a.cwd})` : ''}${a.saveTo ? ` > ${a.saveTo}` : ''}`,
    execute: async (a) => {
      try {
        return await execCommand(a, ctx.conversationId, undefined, ctx.ui);
      } catch (error) {
        // npm/mvn on Windows without Git Bash: ask where it is, right in the conversation.
        if (error instanceof ShellNeededError) throw new Error(`${error.message}. ${askShellPath(ctx.conversationId, ctx.ui)}`);
        throw error;
      }
    },
    timeoutMs: 1_800_000,
  });
  useTool(runPython);
  useShell(ctx);
}

const shellInput = v.object({
  line: v.pipe(v.string(), v.minLength(1), v.maxLength(4000), v.description('One line of shell (bash): pipes, &&, redirects, a team script. Use run_command when one program with arguments is enough.')),
  purpose: v.pipe(v.string(), v.description('One line: why you run this. Shown to the developer.')),
  cwd: v.optional(v.pipe(v.string(), v.description('Folder inside the workspace (default: the workspace)'))),
  timeoutSeconds: v.optional(v.number()),
  saveTo: v.optional(v.pipe(v.string(), v.description('Write the whole output to this file instead of returning it'))),
});

/**
 * run_shell: a line in the developer's shell (Git Bash on Windows). The shell interprets it, so
 * the Orbi cannot tell a read from a write: a new line always asks, and what it may do is judged
 * from the text (deleting is `apaga`; anything else may publish).
 */
function useShell(ctx: AgentContext) {
  ctx.gated({
    name: 'run_shell',
    description: "Run one line in the developer's shell (Git Bash on Windows, bash elsewhere): pipes, &&, redirects, scripts. Prefer run_command for a single program: it can become a known action that runs alone.",
    input: shellInput,
    // No shell on this machine: ask the developer where it is before asking to approve the line.
    precheck: () => (services().config.shell ? [] : [askShellPath(ctx.conversationId, ctx.ui)]),
    category: () => 'comandos-escrita',
    effect: (a) => shellEffect(a.line),
    summary: (a) => `${a.purpose}: ${a.line}`,
    title: (a) => a.purpose,
    command: (a) => shortCommand('', [a.line]).trim().replace(/^"|"$/g, ''),
    fingerprint: (a) => `run_shell ${a.line}${a.cwd ? ` (em ${a.cwd})` : ''}${a.saveTo ? ` > ${a.saveTo}` : ''}`,
    execute: async (a) => {
      const { config } = services();
      const shell = config.shell;
      if (!shell) throw new Error(askShellPath(ctx.conversationId, ctx.ui));
      const save = a.saveTo ? savePath(a.saveTo, config.workspace) : undefined;
      const result = await runShell(shell, a.line, {
        cwd: insideWorkspace(a.cwd),
        timeoutMs: Math.min(a.timeoutSeconds ?? 120, 1800) * 1000,
        env: config.cliEnv,
        shell,
        ...(save ? { maxOutput: 50_000_000 } : {}),
      });
      const extra = afterCommand(ctx.conversationId, a.line, result);
      if (!save) return JSON.stringify({ ...result, ...extra });
      const ok = result.exitCode === 0 && !result.timedOut;
      if (ok) {
        mkdirSync(dirname(save), { recursive: true });
        writeFileSync(save, result.stdout);
      }
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      return JSON.stringify({ command: a.line, exitCode: result.exitCode, savedTo: ok ? save : null, lines: lines.length, head: lines.slice(0, 5), stderr: result.stderr.slice(0, 2000), timedOut: result.timedOut, ...extra });
    },
    timeoutMs: 1_800_000,
  });
}
