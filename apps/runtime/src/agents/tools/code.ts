import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import { codeFixCategory } from '../../autonomy/policy.ts';
import { asKnownProblem, fixedByCodeAgent } from '../../brain/domain/knowledge.ts';
import { askShellPath } from './shell-setup.ts';
import type { AgentContext } from '../context.ts';
import type { PreparedFix } from '../../code-agents/index.ts';

/**
 * Code work by the coding agents registered on this machine (code-agents/), always in a throwaway
 * copy of the branch, never committed by the agent:
 *   code_agent_investigate  an error nobody knows: always asks first (agent of the task "investigar")
 *   code_agent_fix_known    a known problem fixed by code: the level decides (agent of "corrigir")
 *   code_agent_push_fix     the Orbi commits and pushes; a fix nobody knew always asks, a known one
 *                           follows the level and the global code rules, and tells when it went alone
 *   code_agent_discard_fix  drops the copy
 * Off when no agent is registered: the Orbi then hands the diagnosis to whoever asked.
 */
export const code = defineCapability({ name: 'code', needs: ['codeFixer', 'codeAgents', 'config', 'inbox', 'brain'], register: useCode });

const DEFAULT_BRANCHES = /^(main|master|trunk|develop)$/;
const who = (x: { agent: { name: string }; model: string | null } | null) => (x ? `${x.agent.name}${x.model ? ` · ${x.model}` : ''}` : '');

function useCode(ctx: AgentContext, { codeFixer: fixer, codeAgents, config, inbox, brain }: Deps<'codeFixer' | 'codeAgents' | 'config' | 'inbox' | 'brain'>) {
  const investigator = codeAgents.forTask('investigar');
  const fixerAgent = codeAgents.forTask('corrigir') ?? investigator;
  if (!investigator && !fixerAgent) return;
  const needShell = () => (config.shell ? [] : [askShellPath(inbox, ctx.conversationId, ctx.ui)]);
  const repoInput = { repo: v.pipe(v.string(), v.description('owner/repo')), branch: v.pipe(v.string(), v.description('The branch the work is on (the delivery\'s), never main unless asked')) };

  /** What the model gets back, and the diff in the conversation. */
  const report = (fix: PreparedFix) => {
    ctx.ui({ component: 'status', id: `fix-${fix.id}`, title: `${fix.agent}${fix.model ? ` · ${fix.model}` : ''}`, state: fix.files.length ? 'success' : 'warning', text: `${fix.repo} · ${fix.branch}${fix.files.length ? ` · ${fix.files.length} arquivo(s)` : ' · nenhuma mudança'}` });
    if (fix.files.length) ctx.ui({ component: 'code', id: `fix-diff-${fix.id}`, title: `Correção proposta (${fix.files.length} arquivo${fix.files.length === 1 ? '' : 's'})`, language: 'diff', text: fix.diff.slice(0, 20_000) });
    return JSON.stringify({ fixId: fix.id, agent: fix.agent, model: fix.model, files: fix.files, summary: fix.summary, diff: fix.diff.slice(0, 8_000), ...(fix.problem ? { problem: fix.problem } : {}) });
  };

  if (investigator) {
    ctx.gated({
      name: 'code_agent_investigate',
      description:
        `An error in code that no known problem covers: ask the coding agent for investigations (${who(investigator)}) to reproduce it, try hypotheses and leave the smallest fix, in a throwaway copy of \`branch\`. ` +
        'Give a complete diagnosis: the error, the log, the step and what you already checked. Always asks the developer first. Returns fixId, files, diff and what it tried; nothing is committed.',
      input: v.object({ ...repoInput, diagnosis: v.string() }),
      category: () => 'comandos-escrita',
      effect: () => 'local',
      alwaysAsk: () => true,
      title: (a) => `Investigar com ${who(investigator)}: ${a.repo}`,
      command: () => investigator.agent.command,
      summary: (a) => `Investigar numa cópia descartável de ${a.repo} (${a.branch}), sem commit nem push: ${a.diagnosis.slice(0, 300)}`,
      // Every investigation is new: it never becomes a known action.
      fingerprint: (a) => `code_agent_investigate ${a.repo} ${Date.now()}`,
      precheck: needShell,
      execute: async (a) => {
        ctx.ui({ component: 'status', id: `investigate-${a.repo}`, title: `${who(investigator)} investigando`, state: 'running', text: `${a.repo} · ${a.branch}` });
        const fix = await fixer.prepare({ ...a, task: 'investigar' });
        ctx.ui({ component: 'status', id: `investigate-${a.repo}`, title: `${who(investigator)} investigou`, state: 'success', text: `${a.repo} · ${a.branch}` });
        if (!fix.files.length) await fixer.discard(fix.id);
        return report(fix);
      },
      timeoutMs: 1_800_000,
    });
  }

  if (fixerAgent) {
    ctx.gated({
      name: 'code_agent_fix_known',
      description:
        `A known problem (it came in knownProblems, with quemCorrige the coding agent): ask the coding agent for fixes (${who(fixerAgent)}) to apply its solution in a throwaway copy of \`branch\`. ` +
        'Pass the problem id and the current error. The level of the procedure decides whether it asks. Returns fixId, files and diff for code_agent_push_fix.',
      input: v.object({ ...repoInput, problem: v.pipe(v.string(), v.description('Id of the known problem in the brain')), diagnosis: v.string() }),
      category: () => 'comandos-escrita',
      effect: () => 'local',
      title: (a) => `Corrigir com ${who(fixerAgent)}: ${asKnownProblem(brain.get(a.problem) ?? ({} as never))?.sintoma ?? a.problem}`,
      command: () => fixerAgent.agent.command,
      summary: (a) => `Aplicar a solução conhecida de ${a.problem} numa cópia de ${a.repo} (${a.branch})`,
      // The same known problem fixed again is the same action: it gains autonomy with the level.
      fingerprint: (a) => `code_agent_fix_known ${a.problem}`,
      precheck: (a) => {
        const p = brain.get(a.problem);
        const known = p ? asKnownProblem(p) : undefined;
        if (!known) return [`${a.problem} não é um problema conhecido do cérebro (precisa de sintoma e solucao)`];
        if (!fixedByCodeAgent(known)) return [`${a.problem} não é corrigido pelo agente de código (quem_corrige): siga a solução dele`];
        return needShell();
      },
      execute: async (a) => {
        const known = asKnownProblem(brain.get(a.problem)!)!;
        ctx.ui({ component: 'status', id: `fixknown-${a.problem}`, title: `${who(fixerAgent)} corrigindo`, state: 'running', text: known.sintoma });
        const fix = await fixer.prepare({ ...a, task: 'corrigir', problem: known });
        ctx.ui({ component: 'status', id: `fixknown-${a.problem}`, title: `${who(fixerAgent)} corrigiu na cópia`, state: fix.files.length ? 'success' : 'warning', text: known.sintoma });
        if (!fix.files.length) await fixer.discard(fix.id);
        return report(fix);
      },
      timeoutMs: 1_800_000,
    });
  }

  ctx.gated({
    name: 'code_agent_push_fix',
    description:
      'Apply a fix prepared by code_agent_investigate or code_agent_fix_known: the Orbi commits it on the branch and pushes. A fix nobody knew always asks; a known one follows the level. ' +
      'Then run the failed step again.',
    input: v.object({ fixId: v.string(), commitMessage: v.string() }),
    category: (a) => codeFixCategory(fixer.get(a.fixId)?.files ?? ['?']),
    // A known fix on the delivery's own branch can be undone with a revert, and its CI checks it.
    effect: (a) => {
      const fix = fixer.get(a.fixId);
      return fix?.problem && !DEFAULT_BRANCHES.test(fix.branch) ? 'local' : 'publica';
    },
    alwaysAsk: (a) => !fixer.get(a.fixId)?.problem,
    title: (a) => {
      const fix = fixer.get(a.fixId);
      return fix ? `Aplicar a correção em ${fix.repo} (${fix.branch})` : `Aplicar a correção ${a.fixId}`;
    },
    command: (a) => {
      const fix = fixer.get(a.fixId);
      return fix ? `git commit -m "${a.commitMessage}" && git push origin HEAD:${fix.branch}` : a.commitMessage;
    },
    summary: (a) => {
      const fix = fixer.get(a.fixId);
      return fix ? `${a.commitMessage}\n${fix.files.join(', ')}\n\n${fix.diff.slice(0, 4000)}` : a.commitMessage;
    },
    fingerprint: (a) => {
      const fix = fixer.get(a.fixId);
      return fix?.problem ? `code_agent_push_fix ${fix.problem}` : `code_agent_push_fix ${a.fixId}`;
    },
    precheck: (a) => {
      const fix = fixer.get(a.fixId);
      if (!fix) return [`correção não encontrada: ${a.fixId} (prepare de novo)`];
      return fix.files.length ? [] : ['a correção não alterou nenhum arquivo: não há o que aplicar'];
    },
    execute: async (a, _id, how) => {
      const fix = fixer.get(a.fixId)!;
      const result = await fixer.push(a.fixId, a.commitMessage);
      const commit = /commit (\S+)/.exec(result)?.[1] ?? '';
      const known = fix.problem ? asKnownProblem(brain.get(fix.problem) ?? ({} as never)) : undefined;
      const why = known ? `Problema conhecido: ${known.sintoma}` : 'Correção proposta na investigação e aprovada por você';
      const alone = how === 'auto';
      // Went alone: it stays in Pendências (Para você saber) until seen.
      const item = alone
        ? inbox.add({ kind: 'code-change', conversationId: ctx.conversationId, title: `Correção de código em ${fix.repo} (${fix.branch})`, detail: `${why}\n${fix.agent}${fix.model ? ` · ${fix.model}` : ''} · commit ${commit}\n${fix.files.join('\n')}`, routine: fix.problem ? `problem:${fix.problem}` : undefined })
        : undefined;
      ctx.ui({
        component: 'code_change', id: `change-${fix.id}`, title: 'Houve correção de código', repo: fix.repo, branch: fix.branch, commit, files: fix.files, why,
        agent: `${fix.agent}${fix.model ? ` · ${fix.model}` : ''}`, alone, diff: fix.diff.slice(0, 8000), ...(item ? { inboxId: item.id } : {}),
      });
      return JSON.stringify({ result, commit, alone, next: 'Rode de novo o passo que falhou.' });
    },
  });

  useTool({
    name: 'code_agent_discard_fix',
    description: 'Drop a prepared fix: its throwaway copy is removed, nothing reaches the repository.',
    input: v.object({ fixId: v.string() }),
    async run({ data }) {
      return { output: { discarded: await fixer.discard(data.fixId) } };
    },
  });
}
