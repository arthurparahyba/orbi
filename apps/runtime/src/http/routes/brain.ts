import { Hono } from 'hono';
import { SetPlaybookAutonomy } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body, notFound } from '../errors.ts';

/** The Cérebro screen. */
export function brainRoutes({ brain, config }: OrbiServices) {
  return new Hono()
    .get('/', (c) => c.json({ stats: brain.stats(), gaps: brain.gaps(), ...brain.graph() }))
    .get('/entities/:id', (c) => {
      const entity = brain.get(c.req.param('id'));
      if (!entity) throw notFound('entidade');
      return c.json({ entity, relations: brain.neighbors(entity.id), nearby: brain.reachable(entity.id, 2) });
    })
    .get('/search', (c) => c.json(brain.search(c.req.query('q') ?? '')))
    .get('/playbooks', (c) => c.json(brain.playbooks()))
    .patch('/playbooks/:name', async (c) => {
      const { autonomy } = await body(c, SetPlaybookAutonomy);
      if (!brain.playbook(c.req.param('name'))) throw notFound('playbook');
      return c.json(brain.setPlaybookAutonomy(c.req.param('name'), autonomy));
    })
    .get('/runs', (c) => c.json(brain.runs()))
    .post('/export', (c) => c.json({ written: brain.exportMarkdown(config.brainExportDir), dir: config.brainExportDir }));
}
