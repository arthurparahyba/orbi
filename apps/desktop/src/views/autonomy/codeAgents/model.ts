import type { CodeAgent, CodeAgentCatalogEntry, CodeAgentsState, CodeAgentTask } from '../../../api';

export const TASKS: Array<{ task: CodeAgentTask; title: string; hint: string }> = [
  { task: 'investigar', title: 'Investigar um erro que o Orbi não conhece', hint: 'Reproduz, experimenta numa cópia e propõe uma correção. Sempre com sua aprovação.' },
  { task: 'corrigir', title: 'Corrigir um erro conhecido', hint: 'Recebe o problema e a solução que o cérebro guarda. Segue conforme o nível do procedimento.' },
];

export type AgentState = { label: string; tone: 'done' | 'idle' | 'failed' };

/** How an agent is doing, from its last test. */
export function agentState(a: CodeAgent): AgentState {
  if (a.source === 'env') return { label: 'do .env', tone: 'idle' };
  if (!a.lastTest) return { label: 'não testado', tone: 'idle' };
  return a.lastTest.ok ? { label: 'pronto', tone: 'done' } : { label: 'falhou no teste', tone: 'failed' };
}

/** What each agent is used for ("investigar, corrigir"), or empty. */
export function usedFor(state: CodeAgentsState, agentId: string): string {
  return state.tasks.filter((t) => t.agent === agentId).map((t) => t.task).join(', ');
}

/** Known agents not registered yet: offered as a starting point. */
export function notRegistered(state: CodeAgentsState): CodeAgentCatalogEntry[] {
  return state.catalog.filter((c) => !state.agents.some((a) => a.id === c.id));
}

/** Models offered for a task: the agent's own, plus the one already chosen if it is not listed. */
export function modelOptions(agent: CodeAgent | undefined, chosen: string | null): string[] {
  const list = agent?.models ?? [];
  return chosen && !list.includes(chosen) ? [...list, chosen] : list;
}

/** "a, b , ,c" → ["a", "b", "c"] */
export const parseModels = (text: string): string[] => [...new Set(text.split(',').map((m) => m.trim()).filter(Boolean))];
