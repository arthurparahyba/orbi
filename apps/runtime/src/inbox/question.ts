import { tellAgent } from '../conversations/tell.ts';
import type { InboxHandler } from './types.ts';

/** A question from the Orbi: the answer goes to the conversation as the developer's message. */
export const question: InboxHandler = {
  id: 'pergunta',
  matches: (item) => item.kind === 'question',
  async answer(item, text, d) {
    const receipt = await tellAgent(d.events, d.agent, { id: item.conversationId, message: { kind: 'user', body: text } });
    d.inbox.resolve(item.id, 'answered', text);
    return { status: 202, body: receipt };
  },
};
