import { transcript } from '../procedures/index.ts';
import { proofLabel, proofOf } from '../procedures/index.ts';
import { Hono } from 'hono';
import { RUNS_FOR_N3 } from '../../language/index.ts';
import { EditEntity, EditPlaybook, SetPlaybookAutonomy, type PlaybookProof } from '@orbi/contracts';
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
      const entity = knowledge.get(c.req.param('id'));
      if (!entity) throw notFound('entidade');
      return c.json({ entity, relations: knowledge.neighbors(entity.id), nearby: knowledge.reachable(entity.id, 2), dependents: knowledge.entityDependents(entity.id) });
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
      const { autonomy, level, levelMax } = await body(c, SetPlaybookAutonomy);
      const name = c.req.param('name');
      if (!procedures.definition.playbook(name)) throw notFound('playbook');
      if (autonomy) procedures.definition.setPlaybookAutonomy(name, autonomy);
      if (level !== undefined || levelMax !== undefined) trust.setPlaybookLevel(name, { level, levelMax });
      return c.json(procedures.definition.playbook(name));
    })
    .get('/playbooks/:name/autonomy', (c) => {
      const name = c.req.param('name');
      if (!procedures.definition.playbook(name)) throw notFound('playbook');
      return c.json({ knownActions: trust.knownActions(name), events: trust.autonomyEvents('playbook', name), runsForN3: RUNS_FOR_N3 });
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
    .get('/proofs', (c) => c.json(proofsOf(procedures)))
    // "Não provar este passo agora" (um deploy em produção): e o desfazer.
    .post('/playbooks/:name/steps/:step/waive', (c) => {
      const pb = procedures.definition.playbook(c.req.param('name'));
      const step = pb?.steps.find((x) => x.id === c.req.param('step'));
      if (!pb || !step) throw notFound('passo do procedimento');
      procedures.proofs.record(pb.name, step.id, step.how, null);
      return c.json(proofFor(procedures, pb.name));
    })
    .delete('/playbooks/:name/steps/:step/waive', (c) => {
      const pb = procedures.definition.playbook(c.req.param('name'));
      if (!pb) throw notFound('procedimento');
      procedures.proofs.remove(pb.name, c.req.param('step'));
      return c.json(proofFor(procedures, pb.name));
    })
    .get('/runs', (c) => c.json(procedures.execution.runs()))
    // What an execution actually did, call by call (documento 24), and the whole thing as text.
    .get('/runs/:id/calls', (c) => {
      if (!procedures.execution.run(c.req.param('id'))) throw notFound('execução');
      return c.json(procedures.calls.list(c.req.param('id')));
    })
    .get('/runs/:id/transcript', (c) => {
      const run = procedures.execution.run(c.req.param('id'));
      if (!run) throw notFound('execução');
      return c.text(transcript(run, procedures.calls.list(run.id), run.deviations));
    })
    // Takes back what a run learned by itself about an input (passo 0): the fact it created or the other name.
    .post('/runs/:id/resolved/:input/undo', (c) => {
      if (!procedures.execution.run(c.req.param('id'))) throw notFound('execução');
      return c.json(invalid(() => procedures.execution.undoResolved(c.req.param('id'), c.req.param('input'))));
    })
    .post('/export', (c) => c.json({ written: overview.exportBrain(config.brainExportDir), dir: config.brainExportDir }));
}

/** Where one procedure stands, with the line the developer reads. */
function proofFor(procedures: OrbiServices['procedures'], name: string): PlaybookProof {
  const pb = procedures.definition.playbook(name)!;
  const proof = proofOf(pb.steps, procedures.proofs.list(name));
  return { ...proof, label: proofLabel(proof, pb.steps) };
}

/** Where every procedure stands, in one answer: the screen shows it on each card. */
function proofsOf(procedures: OrbiServices['procedures']): Record<string, PlaybookProof> {
  return Object.fromEntries(procedures.definition.playbooks().map((pb) => [pb.name, proofFor(procedures, pb.name)]));
}
