import type { ConversationInfo, ConversationState, TeachingStage } from '../../api';

/** The path a teaching goes through, as the bar at the top shows it. */
export const STAGES: Array<{ key: TeachingStage; label: string; hint: string }> = [
  { key: 'explicar', label: 'Explicar', hint: 'você conta como faz' },
  { key: 'ensaiar', label: 'Ensaiar', hint: 'eu tento junto' },
  { key: 'combinar', label: 'Combinar', hint: 'onde começa e termina' },
  { key: 'aprender', label: 'Aprender', hint: 'você aprova o que aprendi' },
  { key: 'assumir', label: 'Assumir', hint: 'faço e ganho autonomia' },
];

/** A conversation the runtime has not described yet counts as the start of a teaching. */
export const stateOf = (c?: Pick<ConversationInfo, 'state'>): ConversationState => c?.state ?? { mode: 'ensinando', stage: 'explicar' };

/** The bar of stages shows only while teaching or after: doing something known has no stage. */
export function stageIndex(state: ConversationState): number | undefined {
  return state.mode === 'fazendo' ? undefined : STAGES.findIndex((s) => s.key === state.stage);
}

const DOING: Record<Extract<ConversationState, { mode: 'fazendo' }>['status'], string> = {
  running: 'fazendo', waiting: 'esperando você', done: 'feito', failed: 'não deu certo',
};
const TEACHING: Record<Exclude<TeachingStage, 'assumir'>, string> = {
  explicar: 'Explicando', ensaiar: 'Ensaiando', combinar: 'Combinando início e fim', aprender: 'Esperando você aprovar o que aprendi',
};

/** The line under the title in the list. */
export function stateLine(state: ConversationState): string {
  if (state.mode === 'fazendo') return `${state.playbook} · ${DOING[state.status]}`;
  if (state.mode === 'aprendido') return `Aprendi: ${state.playbook} · N${state.level}`;
  return TEACHING[state.stage];
}

export type GroupKey = 'ensinando' | 'fazendo' | 'aprendido';
const GROUPS: Array<{ key: GroupKey; title: string }> = [
  { key: 'ensinando', title: 'Ensinando' },
  { key: 'fazendo', title: 'Fazendo' },
  { key: 'aprendido', title: 'Já sei fazer' },
];

/** The list by where each conversation is; empty groups are left out, order inside is kept. */
export function groupConversations<C extends Pick<ConversationInfo, 'state'>>(list: C[]): Array<{ key: GroupKey; title: string; items: C[] }> {
  return GROUPS.map((g) => ({ ...g, items: list.filter((c) => stateOf(c).mode === g.key) })).filter((g) => g.items.length > 0);
}
