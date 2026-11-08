'use agent';
import { useMcpConnection, useModel, useSkill, useSubagent } from '@flue/runtime';
import { services } from '../services.ts';
import { useOrbi } from './capabilities.ts';
import { investigador } from '../subagents/investigador.ts';
import { aprenderProcedimento } from '../skills/aprender-procedimento.ts';
import instructions from '../prompts/orbi.md?raw';

/**
 * Orbi — one conversation per piece of work (the id names it: `chat:<ulid>`,
 * `entrega:acme/portal-front:feature/x`, …). Every conversation has the same
 * capabilities; what Orbi knows how to do comes from the brain. The fixed
 * instructions are in prompts/orbi.md; the current state is added here.
 */
export function Orbi({ id }: { id: string }) {
  const { config, brain, browser, vault, pipelines } = services();
  useModel(config.model, { thinkingLevel: 'low' });
  useMcpConnection(browser.connection);
  useSubagent({ ...investigador, model: config.model });
  useSkill(aprenderProcedimento);
  const { activeRun } = useOrbi(id);

  const stats = brain.stats();
  // Names only: the values never reach the model.
  const secrets = vault.list().map((x) => `{{segredo:${x.name}}}${x.description ? ` (${x.description})` : ''}`);
  return [
    instructions,
    `Cérebro agora: ${stats.types} tipos, ${stats.entities} entidades, ${stats.edges} ligações, ${stats.playbooks} playbooks, ${stats.openProposals} aprendizados aguardando aprovação.`,
    activeRun ? `Playbook em execução: ${activeRun.playbook} (run ${activeRun.runId}, autonomia ${activeRun.autonomy}).` : 'Nenhum playbook em execução.',
    pipelineContext(brain.pipelines().map((p) => `${p.name} (${p.stages.map((s) => s.id).join(' → ')})`), pipelines.runs.inConversation(id)),
    secrets.length ? `Credenciais no cofre (use só a referência): ${secrets.join(', ')}.` : 'Nenhuma credencial no cofre.',
    `Workspace com os clones: ${config.workspace}. Conversa: ${id}.`,
  ].join('\n');
}

Orbi.agentName = 'orbi';

/** The esteiras that exist and, if this conversation is a delivery, where it stands. */
function pipelineContext(defs: string[], run: ReturnType<ReturnType<typeof services>['pipelines']['runs']['inConversation']>): string {
  const lines = [defs.length ? `Esteiras: ${defs.join('; ')}.` : 'Nenhuma esteira ainda.'];
  if (run && (run.status === 'running' || run.status === 'waiting')) {
    const stage = run.stages[run.current];
    const state = run.status === 'waiting' ? `esperando o desenvolvedor (${run.waiting?.kind}${run.waiting?.missing ? `: ${run.waiting.missing.join(', ')}` : ''})` : `rodando ${stage.playbook ?? ''}`;
    lines.push(`Esta conversa é a entrega da esteira ${run.pipeline}: etapa ${run.current + 1} de ${run.stages.length} (${stage.label}), ${state}${run.destination ? `, destino ${run.destination}` : ''}.`);
  }
  return lines.join('\n');
}
