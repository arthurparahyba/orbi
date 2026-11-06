import { Hono } from 'hono';
import { tellAgent } from '../../conversations/tell.ts';
import { Answer, Decision, InboxStatusQuery } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, body, notFound, query } from '../errors.ts';
import type { Agent } from './types.ts';

/** What waits for the developer. Decisions and answers go back into the conversation. */
export function inboxRoutes({ inbox, events }: OrbiServices, agent: Agent) {
  const open = (id: string) => {
    const item = inbox.get(id);
    if (!item) throw notFound('item');
    if (item.status !== 'open') throw new HttpError(409, 'conflict', `este item já foi decidido (${item.status})`);
    return item;
  };

  return new Hono()
    .get('/', (c) => {
      const status = query(c, 'status', InboxStatusQuery);
      // ?status= (empty) lists everything; no parameter lists what is open.
      return c.json(inbox.list(status === '' ? {} : { status: status ?? 'open' }));
    })
    .post('/:id/decision', async (c) => {
      const { decision, approver = 'Desenvolvedor' } = await body(c, Decision);
      const item = open(c.req.param('id'));
      if (!item.approvalId) throw new HttpError(409, 'conflict', 'este item não é uma aprovação');
      inbox.resolve(item.id, decision === 'approve' ? 'approved' : 'denied');
      const receipt = await tellAgent(events, agent, {
        id: item.conversationId,
        message: {
          kind: 'signal',
          type: 'tool-approval',
          body: `${approver} ${decision === 'approve' ? 'aprovou' : 'negou'}: ${item.title}`,
          attributes: { approvalId: item.approvalId, decision, approver },
        },
      });
      return c.json(receipt, 202);
    })
    .post('/:id/answer', async (c) => {
      const { text } = await body(c, Answer);
      const item = open(c.req.param('id'));
      if (item.kind !== 'question') throw new HttpError(409, 'conflict', 'este item não é uma pergunta');
      inbox.resolve(item.id, 'answered');
      const receipt = await tellAgent(events, agent, { id: item.conversationId, message: { kind: 'user', body: text } });
      return c.json(receipt, 202);
    });
}
