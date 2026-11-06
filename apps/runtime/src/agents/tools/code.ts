import { useTool } from '@flue/runtime';
import * as v from 'valibot';
import { services } from '../../services.ts';
import { codeFixCategory } from '../../autonomy/policy.ts';
import type { AgentContext } from '../context.ts';

/**
 * Code fixes through Claude Code, in two steps (prepare in a throwaway
 * worktree, then push behind the gate). Off when the fixer is off — it needs
 * the Anthropic API.
 */
export function useCode(ctx: AgentContext) {
  const fixer = services().codeFixer;
  if (!fixer) return;

  useTool({
    name: 'claude_code_prepare_fix',
    description:
      'Ask Claude Code to fix a bug in a repository clone, in a throwaway worktree of `branch`. Give a complete diagnosis (error, logs, suspected cause). Nothing is committed: returns fixId, changed files and diff for claude_code_push_fix.',
    input: v.object({ repo: v.pipe(v.string(), v.description('owner/repo')), branch: v.string(), diagnosis: v.string() }),
    timeoutMs: 1_200_000,
    async run({ data, signal }) {
      ctx.ui({ component: 'status', id: `fix-${data.repo}`, title: 'Claude Code investigando', state: 'running', text: `${data.repo} · ${data.branch}` });
      const fix = await fixer.prepare(data, signal);
      ctx.ui({ component: 'code', id: `fix-diff-${fix.id}`, title: `Correção proposta (${fix.files.length} arquivos)`, language: 'diff', text: fix.diff.slice(0, 20_000) });
      return { output: { fixId: fix.id, files: fix.files, summary: fix.summary, costUsd: fix.costUsd, diff: fix.diff.slice(0, 8_000) } };
    },
  });

  ctx.gated({
    name: 'claude_code_push_fix',
    description: 'Commit and push a fix prepared by claude_code_prepare_fix. Test-only fixes and production-code fixes follow different autonomy rules.',
    input: v.object({ fixId: v.string(), commitMessage: v.string() }),
    category: (a) => codeFixCategory(fixer.get(a.fixId)?.files ?? ['?']),
    summary: (a) => `Subir correção ${a.fixId}: ${a.commitMessage}`,
    execute: (a) => fixer.push(a.fixId, a.commitMessage),
  });
}
