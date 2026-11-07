import { Hono } from 'hono';
import { CreateConversation, RenameConversation } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body, notFound } from '../errors.ts';

/** The sidebar list. The app opens /agents/orbi/<id> for each one. */
export function conversationRoutes({ conversations, agents }: OrbiServices) {
  return new Hono()
    .get('/', (c) => {
      // Conversations a coding agent asked for carry who asked (the list shows a badge).
      const byConversation = new Map(agents.requests.list(1000).map((r) => [r.conversationId, r]));
      return c.json(
        conversations.list().map((conv) => {
          const r = byConversation.get(conv.id);
          return r ? { ...conv, origin: { agent: r.agent, requestId: r.id, procedure: r.procedure, ...r.context } } : conv;
        }),
      );
    })
    .post('/', async (c) => {
      const { title } = await body(c, CreateConversation);
      return c.json(conversations.create(title), 201);
    })
    .delete('/:id', (c) => {
      if (!conversations.delete(c.req.param('id'))) throw notFound('conversa');
      return c.json({ deleted: true });
    })
    .patch('/:id', async (c) => {
      const { title } = await body(c, RenameConversation);
      const item = conversations.touch(c.req.param('id'), title);
      if (!item) throw notFound('conversa');
      return c.json(item);
    });
}
