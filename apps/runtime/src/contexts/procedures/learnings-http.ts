import { Hono } from 'hono';
import type { OrbiServices } from '../../services.ts';
import { notFound } from '../../http/errors.ts';

/**
 * What was already tried in a procedure (docs/funcionalidades/25), shown with it in the Cérebro.
 * The developer may take one off the list (it was wrong, or no longer holds). Changes arrive as
 * `brain` events.
 */
export function stepLearningRoutes({ procedures }: Pick<OrbiServices, 'procedures'>) {
  return new Hono()
    .get('/', (c) => c.json(procedures.learnings.list(c.req.query('playbook') ?? '')))
    .delete('/:id', (c) => {
      if (!procedures.learnings.remove(c.req.param('id'))) throw notFound('aprendizado');
      return c.json({ ok: true });
    });
}
