import { transcript } from '../../brain/domain/run-calls.ts';
import { proofLabel, proofOf } from '../../brain/domain/proofs.ts';
import { Hono } from 'hono';
import { RUNS_FOR_N3 } from '../../brain/domain/levels.ts';
import { EditEntity, EditPlaybook, SetPlaybookAutonomy, type PlaybookProof } from '@orbi/contracts';
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
    // Where each procedure stands: which of its steps already ran as they are written (documento 25).
    .get('/proofs', (c) => c.json(proofsOf(brain)))
    // "Não provar este passo agora" (um deploy em produção): e o desfazer.
    .post('/playbooks/:name/steps/:step/waive', (c) => {
      const pb = brain.playbook(c.req.param('name'));
      const step = pb?.steps.find((x) => x.id === c.req.param('step'));
      if (!pb || !step) throw notFound('passo do procedimento');
      brain.proofs.record(pb.name, step.id, step.how, null);
      return c.json(proofFor(brain, pb.name));
    })
    .delete('/playbooks/:name/steps/:step/waive', (c) => {
      const pb = brain.playbook(c.req.param('name'));
      if (!pb) throw notFound('procedimento');
      brain.proofs.remove(pb.name, c.req.param('step'));
      return c.json(proofFor(brain, pb.name));
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

/** Where one procedure stands, with the line the developer reads. */
function proofFor(brain: OrbiServices['brain'], name: string): PlaybookProof {
  const pb = brain.playbook(name)!;
  const proof = proofOf(pb.steps, brain.proofs.list(name));
  return { ...proof, label: proofLabel(proof, pb.steps) };
}

/** Where every procedure stands, in one answer: the screen shows it on each card. */
function proofsOf(brain: OrbiServices['brain']): Record<string, PlaybookProof> {
  return Object.fromEntries(brain.playbooks().map((pb) => [pb.name, proofFor(brain, pb.name)]));
}
