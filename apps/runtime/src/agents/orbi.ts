'use agent';
import { useMcpConnection, useModel, useSkill, useSubagent } from './runtime-port.ts';
import { services } from '../services.ts';
import { useOrbi } from './capabilities.ts';
import { investigadorFor } from '../subagents/investigador.ts';
import { aprenderProcedimento } from '../skills/aprender-procedimento.ts';
import { composePrompt } from './prompt.ts';

/**
 * Orbi — one conversation per piece of work (the id names it: `chat:<ulid>`,
 * `entrega:acme/portal-front:feature/x`, …). Every conversation has the same
 * capabilities; what Orbi knows how to do comes from the brain. The fixed
 * instructions are in prompts/orbi/, the parts this situation needs (agents/prompt.ts);
 * the current state is added here.
 */
export function Orbi({ id }: { id: string }) {
  // The edge: the conversation reads the Orbi's parts once and hands each capability what it declared.
  const all = services();
  const { config, brain, vault, pipelines, agents, toolOutcomes } = all;
  useModel(config.model, { thinkingLevel: 'low' });
  useMcpConnection(all.browser.connection);
  useSubagent({ ...investigadorFor(all), model: config.model });
  useSkill(aprenderProcedimento);
  const { activeRun } = useOrbi(id, all);

  const stats = brain.stats();
  const defs = brain.pipelines();
  const delivery = pipelines.runs.inConversation(id);
  const instructions = composePrompt({
    activeRun: !!activeRun,
    lastToolFailed: !!toolOutcomes.lastIn(id)?.failed,
    pipelines: defs.length,
    delivery: !!delivery && (delivery.status === 'running' || delivery.status === 'waiting'),
    agentRequest: !!agents.requests.byConversation(id),
  });
  // Names only: the values never reach the model.
  const secrets = vault.list().map((x) => `{{segredo:${x.name}}}${x.description ? ` (${x.description})` : ''}`);
  return [
    instructions,
    `Cérebro agora: ${stats.types} tipos, ${stats.entities} entidades, ${stats.edges} ligações, ${stats.playbooks} playbooks, ${stats.openProposals} aprendizados aguardando aprovação.`,
    activeRun ? `Playbook em execução: ${activeRun.playbook} (run ${activeRun.runId}, autonomia ${activeRun.autonomy}).` : 'Nenhum playbook em execução.',
    pipelineContext(defs.map((p) => `${p.name} (${p.stages.map((s) => s.id).join(' → ')})`), delivery),
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
