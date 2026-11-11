import type { ConversationInfo, ConversationState, TeachingStage } from '../../api';

/** The path a teaching goes through, as the bar at the top shows it (only while teaching or after). */
export const STAGES: Array<{ key: TeachingStage; label: string; hint: string }> = [
  { key: 'explicar', label: 'Explicar', hint: 'você conta como faz' },
  { key: 'ensaiar', label: 'Ensaiar', hint: 'eu tento junto' },
  { key: 'combinar', label: 'Combinar', hint: 'onde começa e termina' },
  { key: 'aprender', label: 'Aprender', hint: 'você aprova o que aprendi' },
  { key: 'assumir', label: 'Assumir', hint: 'faço e ganho autonomia' },
];

/** A conversation the runtime has not described yet is a plain conversation. */
export const stateOf = (c?: Pick<ConversationInfo, 'state'>): ConversationState => c?.state ?? { mode: 'conversa' };

/** Whether the conversation has the teaching look (stage bar, panel): only once teaching started, or doing. */
export const showsPanel = (state: ConversationState): boolean => state.mode !== 'conversa';

/** The bar of stages shows only while teaching or after: a plain conversation or doing something known has none. */
export function stageIndex(state: ConversationState): number | undefined {
  return state.mode === 'ensinando' || state.mode === 'aprendido' ? STAGES.findIndex((s) => s.key === state.stage) : undefined;
}

const DOING: Record<Extract<ConversationState, { mode: 'fazendo' }>['status'], string> = {
  running: 'fazendo', waiting: 'esperando você', done: 'feito', failed: 'não deu certo',
};
const TEACHING: Record<Extract<ConversationState, { mode: 'ensinando' }>['stage'], string> = {
  explicar: 'Aprendendo com você', ensaiar: 'Aprendendo com você · ensaiando', combinar: 'Aprendendo com você · combinando início e fim', aprender: 'Esperando você aprovar o que aprendi',
};

/** The line under the title in the list. */
export function stateLine(state: ConversationState): string {
  if (state.mode === 'conversa') return 'Conversa';
  if (state.mode === 'fazendo') return `${state.playbook} · ${DOING[state.status]}`;
  if (state.mode === 'aprendido') return `Assumi: ${state.playbook} · N${state.level}`;
  return TEACHING[state.stage];
}

export type GroupKey = 'andamento' | 'assumi' | 'recentes';
const GROUPS: Array<{ key: GroupKey; title: string }> = [
  { key: 'andamento', title: 'Em andamento' },
  { key: 'assumi', title: 'Já assumi' },
  { key: 'recentes', title: 'Recentes' },
];

/** Teaching, or doing and not finished: in progress. Learned: taken over. The rest: recent. */
export function groupOf(state: ConversationState): GroupKey {
  if (state.mode === 'ensinando') return 'andamento';
  if (state.mode === 'fazendo') return state.status === 'running' || state.status === 'waiting' ? 'andamento' : 'recentes';
  if (state.mode === 'aprendido') return 'assumi';
  return 'recentes';
}

/** The list by where each conversation is; empty groups are left out, order inside is kept. */
export function groupConversations<C extends Pick<ConversationInfo, 'state'>>(list: C[]): Array<{ key: GroupKey; title: string; items: C[] }> {
  return GROUPS.map((g) => ({ ...g, items: list.filter((c) => groupOf(stateOf(c)) === g.key) })).filter((g) => g.items.length > 0);
}
