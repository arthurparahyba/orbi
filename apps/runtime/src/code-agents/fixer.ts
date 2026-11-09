import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulidx';
import { runCommand, runShell } from '../terminal/exec.ts';
import { agentLine } from './command.ts';
import type { CodeAgents } from './registry.ts';
import type { CodeAgentTask } from './types.ts';
import type { KnownProblem } from '../brain/domain/knowledge.ts';

/**
 * Work by a coding agent installed on this machine (registered in code-agents/registry.ts), run
 * through the developer's shell, in the background: the Orbi does not ship one. Always in two steps:
 *  1. prepare — the agent of the task (investigar or corrigir), with its model, edits a throwaway
 *     git worktree of the branch; nothing is committed.
 *  2. push    — after the autonomy gate (test-only vs production code), the Orbi commits and pushes.
 * The split exists because the gate needs the list of changed files, which only exists after the
 * agent has worked.
 */
export interface PreparedFix {
  id: string;
  repo: string;
  branch: string;
  worktree: string;
  files: string[];
  diff: string;
  summary: string;
  /** Who did it, for the cards and the trail. */
  agent: string;
  model: string | null;
  task: CodeAgentTask;
  /** The known problem this fix applies, when it is one (the brain's entity id). */
  problem?: string;
}

export interface CodeFixerOptions {
  /** Folder with the repository clones. */
  workspace: string;
  /** Where throwaway worktrees go. */
  scratchDir: string;
  /** Credentials for git (GH_TOKEN…). */
  cliEnv: Record<string, string | undefined>;
  /** The registered agents and which does each task. */
  agents: CodeAgents;
  /** The developer's shell (Git Bash on Windows): read when the agent runs, so a path set later counts. */
  shell: () => string | null;
}

export const FIX_PROMPT = (diagnosis: string, problem?: KnownProblem) =>
  [
    'Corrija o problema abaixo neste repositório. Faça a menor mudança que resolve.',
    'Rode os testes afetados para confirmar. NÃO faça commit nem push.',
    'No final, responda em 2–4 frases: causa, o que mudou e como validou.',
    ...(problem
      ? [
          '',
          'Este problema já aconteceu e foi resolvido assim (problema conhecido):',
          `- sintoma: ${problem.sintoma}`,
          ...(problem.causa ? [`- causa: ${problem.causa}`] : []),
          `- solução: ${problem.solucao}`,
          ...(problem.conferir ? [`- antes de terminar, confira: ${problem.conferir}`] : []),
        ]
      : []),
    '',
    diagnosis,
  ].join('\n');

/** An error nobody knows yet: reproduce, try hypotheses in the copy, keep the change that works. */
export const INVESTIGATE_PROMPT = (diagnosis: string) =>
  [
    'Investigue o erro abaixo neste repositório, que é uma cópia descartável.',
    'Reproduza o erro, teste hipóteses e, se achar a causa, deixe aqui a menor mudança que resolve, com os testes afetados passando.',
    'NÃO faça commit nem push. Não mexa em credenciais nem em arquivos fora do repositório.',
    'No final, responda em até 6 linhas: o que tentou (uma linha por tentativa), a causa, o que mudou e como validou. Se não resolveu, diga o que descobriu.',
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

  async function prepare(input: { repo: string; branch: string; diagnosis: string; task?: CodeAgentTask; problem?: KnownProblem }, signal?: AbortSignal): Promise<PreparedFix> {
    const task = input.task ?? 'corrigir';
    const chosen = opts.agents.forTask(task) ?? opts.agents.forTask(task === 'corrigir' ? 'investigar' : 'corrigir');
    if (!chosen) throw new Error('nenhum agente de código cadastrado para esta tarefa (Autonomia › Agentes de código)');
    const base = repoDir(input.repo);
    const id = ulid().toLowerCase();
    const worktree = join(opts.scratchDir, 'fixes', id);
    mkdirSync(join(opts.scratchDir, 'fixes'), { recursive: true });

    await git(base, ['fetch', 'origin', input.branch]);
    const added = await git(base, ['worktree', 'add', '--detach', worktree, `origin/${input.branch}`]);
    if (added.exitCode !== 0) throw new Error(`git worktree falhou: ${added.stderr}`);

    const shell = opts.shell();
    if (!shell) throw new Error(`${chosen.agent.name} roda pelo terminal, e nenhum shell foi encontrado (Git Bash no Windows)`);
    const ran = await runShell(shell, agentLine(chosen.agent.command, task === 'investigar' ? INVESTIGATE_PROMPT(input.diagnosis) : FIX_PROMPT(input.diagnosis, input.problem), chosen.model), {
      cwd: worktree,
      env: opts.cliEnv,
      shell,
      signal,
      timeoutMs: 1_200_000,
    });
    const summary = ran.exitCode === 0
      ? ran.stdout.trim().slice(-2000)
      : `${chosen.agent.name} saiu com ${ran.exitCode}${ran.timedOut ? ' (tempo esgotado)' : ''}: ${(ran.stderr || ran.stdout).trim().slice(-1500)}`;

    const status = await git(worktree, ['status', '--porcelain']);
    const files = status.stdout
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const diff = (await git(worktree, ['diff'])).stdout;

    const fix: PreparedFix = { id, repo: input.repo, branch: input.branch, worktree, files, diff, summary, agent: chosen.agent.name, model: chosen.model, task, ...(input.problem ? { problem: input.problem.id } : {}) };
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

  /** Drops a prepared fix: the copy is removed, nothing reaches the repository. */
  async function discard(id: string): Promise<boolean> {
    const fix = fixes.get(id);
    if (!fix) return false;
    await git(repoDir(fix.repo), ['worktree', 'remove', '--force', fix.worktree]);
    fixes.delete(id);
    return true;
  }

  return { prepare, push, get, discard };
}
