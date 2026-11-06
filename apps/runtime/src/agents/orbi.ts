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
  const { config, brain, browser } = services();
  useModel(config.model, { thinkingLevel: 'low' });
  useMcpConnection(browser.connection);
  useSubagent({ ...investigador, model: config.model });
  useSkill(aprenderProcedimento);
  const { activeRun } = useOrbi(id);

  const stats = brain.stats();
  return [
    instructions,
    `Cérebro agora: ${stats.entities} entidades, ${stats.edges} ligações, ${stats.playbooks} playbooks, ${stats.openProposals} aprendizados aguardando aprovação.`,
    activeRun ? `Playbook em execução: ${activeRun.playbook} (run ${activeRun.runId}, autonomia ${activeRun.autonomy}).` : 'Nenhum playbook em execução.',
    `Workspace com os clones: ${config.workspace}. Conversa: ${id}.`,
  ].join('\n');
}

Orbi.agentName = 'orbi';
