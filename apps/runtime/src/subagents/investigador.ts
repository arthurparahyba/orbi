import { defineSubagent, useTool } from '../agents/runtime-port.ts';
import type { Deps } from '../agents/capability.ts';
import instructions from '../prompts/investigador.md?raw';
import { runPython, runReadOnlyCommand } from '../agents/tools/terminal.ts';
import { brainQuery } from '../agents/tools/brain.ts';
import { browserRead } from '../agents/tools/browser.ts';

/**
 * Reads logs, diffs and pages so the root agent doesn't have to: raw output stays
 * in this fresh context, and only the diagnosis returns. Read-only by design —
 * subagents cannot hold approvals, so anything that changes state goes back to Orbi.
 */
export function investigadorFor(deps: Deps<'config' | 'brain' | 'browser'>) {
  function Investigador() {
    useTool(runReadOnlyCommand(deps));
    useTool(runPython(deps.config));
    useTool(brainQuery(deps.brain));
    useTool(browserRead(deps.browser));
    return instructions;
  }
  return defineSubagent({
    name: 'investigador',
    description:
      'Investiga uma falha (workflow do GitHub Actions, deploy, logs na AWS, página web) em modo leitura e devolve um diagnóstico com causa e correção sugerida. Passe um briefing completo: repo, branch, id do run, erro.',
    agent: Investigador,
  });
}
