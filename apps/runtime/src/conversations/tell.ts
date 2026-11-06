import { dispatch } from '@flue/runtime';
import type { Events } from '../events.ts';

type Agent = Parameters<typeof dispatch>[0];
type Message = Parameters<typeof dispatch>[1];

/**
 * Sends a message to a conversation from outside it (an approval, a finished
 * demonstration, a follow-up) and announces it, so an app showing that
 * conversation picks up the new turn even if it hadn't started yet.
 */
export async function tellAgent(events: Pick<Events, 'emit'>, agent: Agent, message: Message) {
  const receipt = await dispatch(agent, message);
  events.emit('dispatched', message.id);
  return receipt;
}
