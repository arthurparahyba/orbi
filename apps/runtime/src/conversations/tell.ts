import { dispatch } from '@flue/runtime';
import type { Events } from '../events.ts';
import { log } from '../observability/log.ts';

type Agent = Parameters<typeof dispatch>[0];
type Message = Parameters<typeof dispatch>[1];

/**
 * Sends a message to a conversation from outside it (an approval, a finished
 * demonstration, a follow-up) and announces it, so an app showing that
 * conversation picks up the new turn even if it hadn't started yet.
 */
export async function tellAgent(events: Pick<Events, 'emit'>, agent: Agent, message: Message) {
  let receipt: Awaited<ReturnType<typeof dispatch>>;
  try {
    receipt = await dispatch(agent, message);
  } catch (error) {
    // An answer or approval that cannot reach the conversation must say so (in the log too).
    log.error('mensagem para a conversa não foi entregue', { conversation: message.id, error: String(error) });
    throw error;
  }
  log.info('mensagem entregue à conversa', { conversation: message.id, kind: typeof message.message === 'string' ? 'user' : message.message.kind, submission: (receipt as { submissionId?: string }).submissionId });
  events.emit('dispatched', message.id);
  return receipt;
}
