import type { Inbox } from '../conversations/inbox.ts';
import type { Events } from '../events.ts';
import type { Agent } from '../agents/runtime-port.ts';
import { tellAgent } from '../conversations/tell.ts';
import { log } from '../observability/log.ts';
import type { BrainStore } from '../brain/store.ts';
import { wakeMessage, whenLabel, MAX_ATTEMPTS } from './domain.ts';
import type { Followups } from './service.ts';

/**
 * The clock: every interval, the follow-ups that are due are delivered to their conversation as a
 * `followup` signal. Marked delivered only after the conversation accepted it; a failed delivery is
 * tried again at the next tick, and after MAX_ATTEMPTS it becomes a Pendência instead of vanishing.
 */
type SchedulerDeps = { followups: Followups; inbox: Pick<Inbox, 'add'>; brain: Pick<BrainStore, 'run'> };
/** Hands the wake-up signal to the conversation; throws when it did not get there. */
export type Wake = (conversationId: string, body: string, followupId: string) => Promise<unknown>;

export function startFollowups(s: SchedulerDeps & { events: Pick<Events, 'emit'> }, agent: Agent, intervalMs: number): NodeJS.Timeout {
  const recovered = s.followups.recoverInterrupted();
  if (recovered) log.info('retornos que estavam sendo entregues voltaram para a fila', { count: recovered });
  const wake: Wake = (id, body, followupId) => tellAgent(s.events, agent, { id, message: { kind: 'signal', type: 'followup', body, attributes: { followupId } } });
  let busy = false;
  return setInterval(() => {
    if (busy) return; // a slow delivery: the next tick waits for it instead of claiming in parallel
    busy = true;
    void deliverDue(s, wake).finally(() => { busy = false; });
  }, intervalMs);
}

export async function deliverDue(s: SchedulerDeps, wake: Wake, at = new Date().toISOString()): Promise<void> {
  for (const f of s.followups.claimDue(at)) {
    const playbook = f.runId ? s.brain.run(f.runId)?.playbook : undefined;
    try {
      await wake(f.conversationId, wakeMessage(f, playbook), f.id);
      s.followups.delivered(f);
    } catch (error) {
      const next = s.followups.deliveryFailed(f, error instanceof Error ? error.message : String(error));
      log.error('retorno agendado não chegou à conversa', { conversation: f.conversationId, followup: f.id, attempt: next.attempts, error });
      if (next.status === 'failed') {
        s.inbox.add({
          kind: 'followup',
          conversationId: f.conversationId,
          title: `Não consegui voltar à conversa às ${whenLabel(f.dueAt)}`,
          detail: `${f.note}\n\nTentei ${MAX_ATTEMPTS} vezes: ${next.lastError ?? ''}`,
        });
      }
    }
  }
}
