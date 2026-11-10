/**
 * A follow-up: the Orbi waking itself up later in a conversation, to check something slow (CI,
 * a deploy, an ECS task). Its life, without storage (docs/funcionalidades/11):
 *
 *   scheduled ──due──▶ delivering ──accepted──▶ delivered
 *       │                  │
 *       │                  └─failed─▶ scheduled again (next tick), until MAX_ATTEMPTS ─▶ failed
 *       └─────────────▶ cancelled (by the developer, by a new one, by deleting the conversation)
 *
 * One active (scheduled or delivering) per conversation: a new one replaces it, and says so.
 */
export type FollowupStatus = 'scheduled' | 'delivering' | 'delivered' | 'failed' | 'cancelled';

export interface Followup {
  id: string;
  conversationId: string;
  dueAt: string;
  note: string;
  status: FollowupStatus;
  attempts: number;
  /** The run and step it wakes up, when scheduled inside a procedure. */
  runId?: string | null;
  stepId?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  /** 'desenvolvedor', 'substituido', 'conversa apagada'… */
  cancelledBy?: string | null;
  lastError?: string | null;
}

/** Deliveries tried before the follow-up is given up (and the developer told). */
export const MAX_ATTEMPTS = 3;

export const isActive = (f: Pick<Followup, 'status'>) => f.status === 'scheduled' || f.status === 'delivering';

/** A delivery that did not reach the conversation: try again at the next tick, or give up. */
export function afterFailedDelivery(f: Followup, error: string): Followup {
  const attempts = f.attempts + 1;
  return { ...f, attempts, lastError: error, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'scheduled' };
}

/** "15:40" in the machine's time, what people read; the date only when it is not today. */
export function whenLabel(dueAt: string, now = new Date()): string {
  const due = new Date(dueAt);
  const time = due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return due.toDateString() === now.toDateString() ? time : `${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

/** The message the conversation receives when it is due: what to check, and for which step. */
export function wakeMessage(f: Pick<Followup, 'note' | 'stepId'>, playbook?: string): string {
  const where = f.stepId ? ` (passo ${f.stepId}${playbook ? ` de ${playbook}` : ''})` : '';
  return `Retorno agendado${where}: ${f.note}`;
}

/** What the Orbi is told every turn while one is active, so it never has to guess. */
export function situationLine(f: Pick<Followup, 'dueAt' | 'note'> | undefined, now = new Date()): string {
  return f ? `Retorno agendado para ${whenLabel(f.dueAt, now)}: ${f.note}.` : 'Não há retorno agendado nesta conversa.';
}
