import { Hono } from 'hono';
import { EditEntity, EditPlaybook, SetPlaybookAutonomy } from '@orbi/contracts';
import { procedureProofs, runTranscript, setProcedureAutonomy, unwaiveStepProof, waiveStepProof } from '../procedures/index.ts';
import { procedureAutonomy } from '../trust/index.ts';
import { entityPanel } from './use-cases/entity-panel.ts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, body, notFound } from '../../http/errors.ts';

/** Rule violations (an id repeated, a step without a name) are the caller's to fix: 400. */
const invalid = (fn: () => unknown) => {
  try {
    return fn();
  } catch (error) {
    throw new HttpError(400, 'invalid_body', error instanceof Error ? error.message : String(error));
  }
};

/** The Cérebro screen. */
/**
 * The two readings that cross contexts (`stats` and the export) come from the composition, like
 * `browserRoutes` takes its background job: a context never imports the composition (documento 26).
 */
export interface BrainOverview {
  stats(): { types: number; entities: number; edges: number; playbooks: number; openProposals: number };
  exportBrain(dir: string): number;
}

export function brainRoutes(s: OrbiServices, overview: BrainOverview) {
  const { knowledge, procedures, trust, config } = s;
  return new Hono()
    .get('/', (c) => c.json({ stats: overview.stats(), gaps: knowledge.gaps(), ...knowledge.graph() }))
    .get('/entities/:id', (c) => {
      const panel = entityPanel(s, c.req.param('id')!);
      if ('refused' in panel) throw notFound(panel.refused);
      return c.json(panel);
    })
    .patch('/entities/:id', async (c) => {
      const change = await body(c, EditEntity);
      if (!knowledge.get(c.req.param('id'))) throw notFound('entidade');
      return c.json(invalid(() => knowledge.editEntity(c.req.param('id'), change)));
    })
    .delete('/entities/:id', (c) => {
      if (!knowledge.get(c.req.param('id'))) throw notFound('entidade');
      return c.json({ deleted: true, ...knowledge.deleteEntity(c.req.param('id')) });
    })
    .get('/search', (c) => c.json(knowledge.search(c.req.query('q') ?? '')))
    .get('/playbooks', (c) => c.json(procedures.definition.playbooks()))
    .patch('/playbooks/:name', async (c) => {
      const change = await body(c, SetPlaybookAutonomy);
      const procedure = setProcedureAutonomy(s, c.req.param('name'), change);
      if ('refused' in procedure) throw notFound('playbook');
      return c.json(procedure);
    })
    .get('/playbooks/:name/autonomy', (c) => {
      const panel = procedureAutonomy(s, c.req.param('name'));
      if ('refused' in panel) throw notFound(panel.refused);
      return c.json(panel);
    })
    .put('/playbooks/:name', async (c) => {
      const change = await body(c, EditPlaybook);
      if (!procedures.definition.playbook(c.req.param('name'))) throw notFound('playbook');
      return c.json(invalid(() => procedures.definition.editPlaybook(c.req.param('name'), change)));
    })
    .delete('/playbooks/:name', (c) => {
      if (!procedures.definition.playbook(c.req.param('name'))) throw notFound('playbook');
      return c.json({ deleted: true, ...procedures.definition.deletePlaybook(c.req.param('name')) });
    })
    // Where each procedure stands: which of its steps already ran as they are written (documento 25).
    .get('/proofs', (c) => c.json(procedureProofs(s)))
    // "Não provar este passo agora" (um deploy em produção): e o desfazer.
    .post('/playbooks/:name/steps/:step/waive', (c) => {
      const proof = waiveStepProof(s, c.req.param('name'), c.req.param('step'));
      if ('refused' in proof) throw notFound(proof.refused);
      return c.json(proof);
    })
    .delete('/playbooks/:name/steps/:step/waive', (c) => {
      const proof = unwaiveStepProof(s, c.req.param('name'), c.req.param('step'));
      if ('refused' in proof) throw notFound(proof.refused);
      return c.json(proof);
    })
    .get('/runs', (c) => c.json(procedures.execution.runs()))
    // What an execution actually did, call by call (documento 24), and the whole thing as text.
    .get('/runs/:id/calls', (c) => {
      if (!procedures.execution.run(c.req.param('id'))) throw notFound('execução');
      return c.json(procedures.calls.list(c.req.param('id')));
    })
    .get('/runs/:id/transcript', (c) => {
      const written = runTranscript(s, c.req.param('id'));
      if ('refused' in written) throw notFound(written.refused);
      return c.text(written.text);
    })
    // Takes back what a run learned by itself about an input (passo 0): the fact it created or the other name.
    .post('/runs/:id/resolved/:input/undo', (c) => {
      if (!procedures.execution.run(c.req.param('id'))) throw notFound('execução');
      return c.json(invalid(() => procedures.execution.undoResolved(c.req.param('id'), c.req.param('input'))));
    })
    .post('/export', (c) => c.json({ written: overview.exportBrain(config.brainExportDir), dir: config.brainExportDir }));
}
