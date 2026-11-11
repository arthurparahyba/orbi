import { Hono } from 'hono';
import * as v from 'valibot';
import { SetReviewNoteStatus } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body, notFound, query } from '../errors.ts';

/**
 * What the end-of-run review kept (docs/funcionalidades/19): ideas for a procedure, shown in the
 * Cérebro, and environments to fix, answered on the review card ("Agora não", fixed). Changes
 * arrive as `brain` events.
 */
export function reviewNoteRoutes({ brain }: Pick<OrbiServices, 'brain'>) {
  return new Hono()
    .get('/', (c) => {
      const playbook = c.req.query('playbook') || undefined;
      const kind = query(c, 'kind', v.optional(v.picklist(['idea', 'environment', 'change'])));
      const status = query(c, 'status', v.optional(v.picklist(['kept', 'open', 'dismissed', 'done', 'applied'])));
      return c.json(brain.review.notes({ playbook, kind, status }));
    })
    .post('/:id/status', async (c) => {
      const { status } = await body(c, SetReviewNoteStatus);
      if (!brain.review.note(c.req.param('id'))) throw notFound('anotação da revisão');
      return c.json(brain.review.setStatus(c.req.param('id'), status));
    });
}
