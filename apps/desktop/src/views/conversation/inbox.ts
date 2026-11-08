import type { InboxItem } from '../../api';

/**
 * How the Pendências panel organizes what is open: what waits for your approval or
 * decision first, then questions, then notes that only inform (a level went up).
 */
export type InboxGroupKey = 'aprovar' | 'perguntas' | 'saber';
export interface InboxGroup { key: InboxGroupKey; title: string; items: InboxItem[] }

const GROUP_OF: Record<InboxItem['kind'], InboxGroupKey> = {
  approval: 'aprovar', learning: 'aprovar', pipeline: 'aprovar', question: 'perguntas', secret: 'perguntas', level: 'saber',
};
const TITLES: Record<InboxGroupKey, string> = { aprovar: 'Falta você aprovar', perguntas: 'Perguntas', saber: 'Para você saber' };

export function groupInbox(items: InboxItem[]): InboxGroup[] {
  return (['aprovar', 'perguntas', 'saber'] as const)
    .map((key) => ({ key, title: TITLES[key], items: items.filter((i) => GROUP_OF[i.kind] === key) }))
    .filter((g) => g.items.length > 0);
}

/** Only notes wait for nothing: everything else counts in badges and "esperando você". */
export const needsYou = (i: InboxItem) => i.kind !== 'level';

/** The "Manter" button of a note: undo the automatic change. */
export function keepLabel(i: InboxItem): string | null {
  if (i.kind !== 'level' || !i.routine || !i.approvalId) return null;
  if (i.routine.startsWith('playbook:')) return `Manter em N${i.approvalId}`;
  if (i.routine.startsWith('passage:')) return 'Manter perguntando';
  return null;
}

/** "há 2 min", "há 1 h", "ontem". */
export function since(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return h < 48 ? 'ontem' : `há ${Math.round(h / 24)} dias`;
}
