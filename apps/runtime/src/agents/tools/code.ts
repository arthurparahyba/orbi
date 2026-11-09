import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import { codeFixCategory } from '../../autonomy/policy.ts';
import { askShellPath } from './shell-setup.ts';
import type { AgentContext } from '../context.ts';

/**
 * Code fixes by the coding agent installed on this machine (ORBI_CODE_AGENT), in two steps:
 * prepare in a throwaway worktree, then push behind the gate. Off when no agent is configured:
 * the Orbi then hands the diagnosis to whoever asked.
 */
export const code = defineCapability({ name: 'code', needs: ['codeFixer', 'config', 'inbox'], register: useCode });

function useCode(ctx: AgentContext, { codeFixer: fixer, config, inbox }: Deps<'codeFixer' | 'config' | 'inbox'>) {
  if (!fixer) return;
  const agent = config.codeAgent ?? 'agente de código';

  ctx.gated({
    name: 'code_agent_prepare_fix',
    description:
      `Ask the coding agent installed here (${agent}) to fix a bug in a repository clone, in a throwaway worktree of \`branch\`. Give a complete diagnosis (error, logs, suspected cause). Nothing is committed: returns fixId, changed files and diff for code_agent_push_fix.`,
    input: v.object({ repo: v.pipe(v.string(), v.description('owner/repo')), branch: v.string(), diagnosis: v.string() }),
    // Runs a program of this machine on a throwaway copy: local, and asks like any new command.
    category: () => 'comandos-escrita',
    effect: () => 'local',
    title: (a) => `Pedir ao agente de código para corrigir ${a.repo}`,
    command: () => agent,
    summary: (a) => `${agent} corrige ${a.repo} (${a.branch}) numa cópia descartável: ${a.diagnosis.slice(0, 200)}`,
    fingerprint: (a) => `code_agent_prepare_fix ${a.repo}`,
    precheck: () => (config.shell ? [] : [askShellPath(inbox, ctx.conversationId, ctx.ui)]),
    execute: async (a) => {
      ctx.ui({ component: 'status', id: `fix-${a.repo}`, title: 'Agente de código investigando', state: 'running', text: `${a.repo} · ${a.branch}` });
      const fix = await fixer.prepare(a);
      ctx.ui({ component: 'code', id: `fix-diff-${fix.id}`, title: `Correção proposta (${fix.files.length} arquivos)`, language: 'diff', text: fix.diff.slice(0, 20_000) });
      return JSON.stringify({ fixId: fix.id, files: fix.files, summary: fix.summary, diff: fix.diff.slice(0, 8_000) });
    },
    timeoutMs: 1_200_000,
  });

  ctx.gated({
    name: 'code_agent_push_fix',
    description: 'Commit and push a fix prepared by code_agent_prepare_fix. Test-only fixes and production-code fixes follow different autonomy rules.',
    input: v.object({ fixId: v.string(), commitMessage: v.string() }),
    category: (a) => codeFixCategory(fixer.get(a.fixId)?.files ?? ['?']),
    effect: () => 'publica',
    summary: (a) => `Subir correção ${a.fixId}: ${a.commitMessage}`,
    execute: (a) => fixer.push(a.fixId, a.commitMessage),
  });
}
