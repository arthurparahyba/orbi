import { transcript } from '../../brain/domain/run-calls.ts';
import { Hono } from 'hono';
import { RUNS_FOR_N3 } from '../../brain/domain/levels.ts';
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
      const { autonomy, level, levelMax } = await body(c, SetPlaybookAutonomy);
      const name = c.req.param('name');
      if (!brain.playbook(name)) throw notFound('playbook');
      if (autonomy) brain.setPlaybookAutonomy(name, autonomy);
      if (level !== undefined || levelMax !== undefined) brain.setPlaybookLevel(name, { level, levelMax });
      return c.json(brain.playbook(name));
    })
    .get('/playbooks/:name/autonomy', (c) => {
      const name = c.req.param('name');
      if (!brain.playbook(name)) throw notFound('playbook');
      return c.json({ knownActions: brain.knownActions(name), events: brain.autonomyEvents('playbook', name), runsForN3: RUNS_FOR_N3 });
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
    // What an execution actually did, call by call (documento 24), and the whole thing as text.
    .get('/runs/:id/calls', (c) => {
      if (!brain.run(c.req.param('id'))) throw notFound('execução');
      return c.json(brain.calls.list(c.req.param('id')));
    })
    .get('/runs/:id/transcript', (c) => {
      const run = brain.run(c.req.param('id'));
      if (!run) throw notFound('execução');
      return c.text(transcript(run, brain.calls.list(run.id), run.deviations));
    })
    // Takes back what a run learned by itself about an input (passo 0): the fact it created or the other name.
    .post('/runs/:id/resolved/:input/undo', (c) => {
      if (!brain.run(c.req.param('id'))) throw notFound('execução');
      return c.json(invalid(() => brain.execution.undoResolved(c.req.param('id'), c.req.param('input'))));
    })
    .post('/export', (c) => c.json({ written: brain.exportMarkdown(config.brainExportDir), dir: config.brainExportDir }));
}
