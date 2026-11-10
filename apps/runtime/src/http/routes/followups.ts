import { Hono } from 'hono';
import type { OrbiServices } from '../../services.ts';
import { notFound } from '../errors.ts';

/**
 * Follow-ups the developer can see and cancel (docs/funcionalidades/11): the ones waiting (all, or
 * of one conversation). Changes arrive as `followups` events.
 */
export function followupRoutes({ followups }: Pick<OrbiServices, 'followups'>) {
  return new Hono()
    .get('/', (c) => {
      const conversation = c.req.query('conversation');
      return c.json(conversation ? followups.allActive().filter((f) => f.conversationId === conversation) : followups.allActive());
    })
    .delete('/:id', (c) => {
      if (!followups.get(c.req.param('id'))) throw notFound('retorno');
      const cancelled = followups.cancel(c.req.param('id'), 'desenvolvedor');
      return c.json(cancelled ?? followups.get(c.req.param('id')));
    });
}
