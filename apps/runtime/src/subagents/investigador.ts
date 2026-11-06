import { defineSubagent, useTool } from '@flue/runtime';
import { brainQuery, browserRead, runPython, runReadOnlyCommand } from '../agents/capabilities.ts';

/**
 * Reads logs, diffs and pages so the root agent doesn't have to: raw output stays
 * in this fresh context, and only the diagnosis returns. Read-only by design —
 * subagents cannot hold approvals, so anything that changes state goes back to Orbi.
 */
function Investigador() {
  useTool(runReadOnlyCommand);
  useTool(runPython);
  useTool(brainQuery);
  useTool(browserRead);
  return [
    'Você investiga uma falha (CI, deploy, página web) e devolve um diagnóstico curto.',
    'Use somente leitura: gh run view --log-failed, git log/diff, aws logs tail, scripts Python, o navegador em leitura.',
    'Consulte brain_query por incidentes e playbooks parecidos antes de concluir.',
    'Responda com: o que falhou (com a linha de erro), a causa provável, a evidência, se já aconteceu antes (id do incidente) e a correção sugerida, dizendo se mexe só em teste ou em código de produção.',
  ].join('\n');
}

export const investigador = defineSubagent({
  name: 'investigador',
  description:
    'Investiga uma falha (workflow do GitHub Actions, deploy, logs na AWS, página web) em modo leitura e devolve um diagnóstico com causa e correção sugerida. Passe um briefing completo: repo, branch, id do run, erro.',
  agent: Investigador,
});
