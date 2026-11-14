import { Hono } from 'hono';
import type { OrbiServices } from '../../services.ts';
import { notFound } from '../errors.ts';

/**
 * What went wrong by the Orbi's own fault, or in a call the model got wrong (documento 24), kept
 * apart from the review of the procedure. `?run=` traz os de uma execução (inclusive os já
 * dispensados); sem parâmetro, os que estão abertos. Mudanças viram evento `runs`.
 */
export function diagnosisRoutes({ diagnoses }: Pick<OrbiServices, 'diagnoses'>) {
  return new Hono()
    .get('/', (c) => {
      const run = c.req.query('run');
      return c.json(run ? diagnoses.forRun(run) : diagnoses.list());
    })
    .post('/:id/dismiss', (c) => {
      if (!diagnoses.dismiss(c.req.param('id'))) throw notFound('diagnóstico');
      return c.json({ ok: true });
    });
}
