import { Hono } from 'hono';
import { EditEntity, EditPlaybook, SetPlaybookAutonomy } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, body, notFound } from '../errors.ts';

/** Rule violations (an id repeated, a step without a name) are the caller's to fix: 400. */
const invalid = (fn: () => unknown) => {
  try {
    return fn();
  } catch (error) {
    throw new HttpError(400, 'invalid_body', error instanceof Error ? error.message : String(error));
  }
};

/** The Cérebro screen. */
export function brainRoutes({ brain, config }: OrbiServices) {
  return new Hono()
    .get('/', (c) => c.json({ stats: brain.stats(), gaps: brain.gaps(), ...brain.graph() }))
    .get('/entities/:id', (c) => {
      const entity = brain.get(c.req.param('id'));
      if (!entity) throw notFound('entidade');
      return c.json({ entity, relations: brain.neighbors(entity.id), nearby: brain.reachable(entity.id, 2), dependents: brain.entityDependents(entity.id) });
    })
    .patch('/entities/:id', async (c) => {
      const change = await body(c, EditEntity);
      if (!brain.get(c.req.param('id'))) throw notFound('entidade');
      return c.json(invalid(() => brain.editEntity(c.req.param('id'), change)));
    })
    .delete('/entities/:id', (c) => {
      if (!brain.get(c.req.param('id'))) throw notFound('entidade');
      return c.json({ deleted: true, ...brain.deleteEntity(c.req.param('id')) });
    })
    .get('/search', (c) => c.json(brain.search(c.req.query('q') ?? '')))
    .get('/playbooks', (c) => c.json(brain.playbooks()))
    .patch('/playbooks/:name', async (c) => {
      const { autonomy } = await body(c, SetPlaybookAutonomy);
      if (!brain.playbook(c.req.param('name'))) throw notFound('playbook');
      return c.json(brain.setPlaybookAutonomy(c.req.param('name'), autonomy));
    })
    .put('/playbooks/:name', async (c) => {
      const change = await body(c, EditPlaybook);
      if (!brain.playbook(c.req.param('name'))) throw notFound('playbook');
      return c.json(invalid(() => brain.editPlaybook(c.req.param('name'), change)));
    })
    .delete('/playbooks/:name', (c) => {
      if (!brain.playbook(c.req.param('name'))) throw notFound('playbook');
      return c.json({ deleted: true, ...brain.deletePlaybook(c.req.param('name')) });
    })
    .get('/runs', (c) => c.json(brain.runs()))
    .post('/export', (c) => c.json({ written: brain.exportMarkdown(config.brainExportDir), dir: config.brainExportDir }));
}
