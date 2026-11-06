import { Hono } from 'hono';
import { CreateConversation, RenameConversation } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body, notFound } from '../errors.ts';

/** The sidebar list. The app opens /agents/orbi/<id> for each one. */
export function conversationRoutes({ conversations }: OrbiServices) {
  return new Hono()
    .get('/', (c) => c.json(conversations.list()))
    .post('/', async (c) => {
      const { title } = await body(c, CreateConversation);
      return c.json(conversations.create(title), 201);
    })
    .patch('/:id', async (c) => {
      const { title } = await body(c, RenameConversation);
      const item = conversations.touch(c.req.param('id'), title);
      if (!item) throw notFound('conversa');
      return c.json(item);
    });
}
