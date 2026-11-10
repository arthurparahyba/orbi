import type { Followup } from '../../api';

/** "15:40", or "11/11 15:40" when not today: what people read for a follow-up's time. */
export function whenLabel(dueAt: string, now = new Date()): string {
  const due = new Date(dueAt);
  const time = due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return due.toDateString() === now.toDateString() ? time : `${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

/** The pill of a conversation that waits for its follow-up (instead of "Pronto"). */
export function followupPill(f: Followup | undefined, now = new Date()): { tone: string; text: string } | undefined {
  if (!f) return undefined;
  return f.status === 'delivering' ? { tone: 'running', text: 'Voltando agora…' } : { tone: 'waiting', text: `Volto às ${whenLabel(f.dueAt, now)}` };
}
