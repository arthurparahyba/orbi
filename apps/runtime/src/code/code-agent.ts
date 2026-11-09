import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulidx';
import { runCommand, runShell } from '../terminal/exec.ts';
import { shQuote } from '../terminal/shell.ts';

/**
 * Code fixes by the coding agent installed on this machine (Claude Code, Codex, Copilot CLI…),
 * run through the developer's shell: the Orbi does not ship one. Always in two steps:
 *  1. prepare — the agent edits a throwaway git worktree; nothing is pushed.
 *  2. push    — after the autonomy gate (test-only vs production code), commit and push.
 * The split exists because the gate needs the list of changed files, which only exists after the
 * agent has worked. ORBI_CODE_AGENT is the command (`claude -p`, `codex exec`): the request goes
 * as its last argument, or where `{prompt}` is written.
 */
export interface PreparedFix {
  id: string;
  repo: string;
  branch: string;
  worktree: string;
  files: string[];
  diff: string;
  summary: string;
}

export interface CodeFixerOptions {
  /** Folder with the repository clones. */
  workspace: string;
  /** Where throwaway worktrees go. */
  scratchDir: string;
  /** Credentials for git (GH_TOKEN…). */
  cliEnv: Record<string, string | undefined>;
  /** The coding agent's command line, e.g. `claude -p` (ORBI_CODE_AGENT). */
  command: string;
  /** The developer's shell (Git Bash on Windows): read when the agent runs, so a path set later counts. */
  shell: () => string | null;
}

/** The agent's command with the request in it: as its last argument, or where `{prompt}` is. */
export function agentLine(command: string, prompt: string): string {
  return command.includes('{prompt}') ? command.split('{prompt}').join(shQuote(prompt)) : `${command} ${shQuote(prompt)}`;
}

export const FIX_PROMPT = (diagnosis: string) =>
  [
    'Corrija o problema abaixo neste repositório. Faça a menor mudança que resolve.',
    'Rode os testes afetados para confirmar. NÃO faça commit nem push.',
    'No final, responda em 2–4 frases: causa, o que mudou e como validou.',
    '',
    diagnosis,
  ].join('\n');

export type CodeFixer = ReturnType<typeof createCodeFixer>;

export function createCodeFixer(opts: CodeFixerOptions) {
  const fixes = new Map<string, PreparedFix>();

  function repoDir(repo: string): string {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`repo inválido: ${repo}`);
    const dir = join(opts.workspace, repo.split('/')[1]);
    if (!existsSync(join(dir, '.git'))) throw new Error(`clone não encontrado em ${dir}`);
    return dir;
  }

  const git = (cwd: string, args: string[], timeoutMs = 60_000) =>
    runCommand('git', args, { cwd, env: opts.cliEnv, timeoutMs, allowed: ['git'] });

  async function prepare(input: { repo: string; branch: string; diagnosis: string }, signal?: AbortSignal): Promise<PreparedFix> {
    const base = repoDir(input.repo);
    const id = ulid().toLowerCase();
    const worktree = join(opts.scratchDir, 'fixes', id);
    mkdirSync(join(opts.scratchDir, 'fixes'), { recursive: true });

    await git(base, ['fetch', 'origin', input.branch]);
    const added = await git(base, ['worktree', 'add', '--detach', worktree, `origin/${input.branch}`]);
    if (added.exitCode !== 0) throw new Error(`git worktree falhou: ${added.stderr}`);

    const shell = opts.shell();
    if (!shell) throw new Error('o agente de código roda pelo terminal, e nenhum shell foi encontrado (Git Bash no Windows)');
    const ran = await runShell(shell, agentLine(opts.command, FIX_PROMPT(input.diagnosis)), {
      cwd: worktree,
      env: opts.cliEnv,
      shell,
      signal,
      timeoutMs: 1_200_000,
    });
    const summary = ran.exitCode === 0
      ? ran.stdout.trim().slice(-2000)
      : `o agente de código saiu com ${ran.exitCode}${ran.timedOut ? ' (tempo esgotado)' : ''}: ${(ran.stderr || ran.stdout).trim().slice(-1500)}`;

    const status = await git(worktree, ['status', '--porcelain']);
    const files = status.stdout
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const diff = (await git(worktree, ['diff'])).stdout;

    const fix: PreparedFix = { id, repo: input.repo, branch: input.branch, worktree, files, diff, summary };
    fixes.set(id, fix);
    return fix;
  }

  function get(id: string): PreparedFix | undefined {
    return fixes.get(id);
  }

  async function push(id: string, commitMessage: string): Promise<string> {
    const fix = fixes.get(id);
    if (!fix) throw new Error(`correção não encontrada: ${id}`);
    if (!fix.files.length) throw new Error('a correção não alterou nenhum arquivo');
    for (const args of [
      ['add', '-A'],
      ['-c', 'user.name=Orbi', '-c', 'user.email=orbi@localhost', 'commit', '-m', commitMessage],
      ['push', 'origin', `HEAD:${fix.branch}`],
    ]) {
      const result = await git(fix.worktree, args, 120_000);
      if (result.exitCode !== 0) throw new Error(`git ${args[0]} falhou: ${result.stderr}`);
    }
    const sha = (await git(fix.worktree, ['rev-parse', '--short', 'HEAD'])).stdout.trim();
    await git(repoDir(fix.repo), ['worktree', 'remove', '--force', fix.worktree]);
    fixes.delete(id);
    return `commit ${sha} enviado para ${fix.branch}`;
  }

  return { prepare, push, get };
}
