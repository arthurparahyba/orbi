import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ulid } from 'ulidx';
import { runCommand } from '../terminal/exec.ts';

/**
 * Code fixes go through Claude Code (the Claude Agent SDK), always in two steps:
 *  1. prepareFix — Claude Code edits a throwaway git worktree; nothing is pushed.
 *  2. pushFix    — after the autonomy gate (test-only vs production code), commit and push.
 * The split exists because the gate needs the list of changed files, which only
 * exists after Claude Code has worked.
 */
export interface PreparedFix {
  id: string;
  repo: string;
  branch: string;
  worktree: string;
  files: string[];
  diff: string;
  summary: string;
  costUsd: number;
}

export interface CodeFixerOptions {
  /** Folder with the repository clones. */
  workspace: string;
  /** Where throwaway worktrees go. */
  scratchDir: string;
  /** Credentials for git (GH_TOKEN…). */
  cliEnv: Record<string, string | undefined>;
  /** Claude Agent SDK model id. */
  model: string;
  /** Spend cap per fix, USD. */
  budgetUsd: number;
}

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

    let summary = '';
    let costUsd = 0;
    const abortController = new AbortController();
    signal?.addEventListener('abort', () => abortController.abort(), { once: true });

    for await (const message of query({
      prompt: [
        'Corrija o problema abaixo neste repositório. Faça a menor mudança que resolve.',
        'Rode os testes afetados para confirmar. NÃO faça commit nem push.',
        'No final, responda em 2–4 frases: causa, o que mudou e como validou.',
        '',
        input.diagnosis,
      ].join('\n'),
      options: {
        cwd: worktree,
        model: opts.model,
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
        disallowedTools: ['Bash(git push:*)', 'Bash(git commit:*)', 'Bash(git reset:*)', 'WebFetch', 'WebSearch'],
        permissionMode: 'acceptEdits',
        maxTurns: 40,
        maxBudgetUsd: opts.budgetUsd,
        settingSources: [],
        abortController,
      },
    })) {
      if (message.type === 'result') {
        costUsd = message.total_cost_usd;
        summary = message.subtype === 'success' ? message.result : `Claude Code parou: ${message.subtype}`;
      }
    }

    const status = await git(worktree, ['status', '--porcelain']);
    const files = status.stdout
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const diff = (await git(worktree, ['diff'])).stdout;

    const fix: PreparedFix = { id, repo: input.repo, branch: input.branch, worktree, files, diff, summary, costUsd };
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
