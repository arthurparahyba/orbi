import { Hono } from 'hono';
import { CreateDomain, EditEntity, EditPlaybook, RenameDomain, SetDomain, SetPlaybookAutonomy } from '@orbi/contracts';
import { procedureProofs, runTranscript, setProcedureAutonomy, unwaiveStepProof, waiveStepProof } from '../procedures/index.ts';
import { procedureAutonomy } from '../trust/index.ts';
import { entityPanel } from './use-cases/entity-panel.ts';
import { domainOverview } from './use-cases/domain-overview.ts';
import { domainDetail } from './use-cases/domain-detail.ts';
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

/** `comum` não tem nome, e um segmento de rota não pode ser vazio: a tela manda `-` por ele. */
const nameOf = (segment: string) => (segment === '-' ? '' : segment);

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
  const { knowledge, domains, procedures, trust, config } = s;
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
    .put('/entities/:id/domain', async (c) => {
      const { domain } = await body(c, SetDomain);
      if (!knowledge.get(c.req.param('id'))) throw notFound('entidade');
      if (domain && !domains.get(domain)) throw notFound('domínio');
      domains.setEntityDomain(c.req.param('id'), domain);
      return c.json(knowledge.get(c.req.param('id')));
    })
    .put('/types/:name/domain', async (c) => {
      const { domain } = await body(c, SetDomain);
      if (!knowledge.type(c.req.param('name'))) throw notFound('tipo');
      if (domain && !domains.get(domain)) throw notFound('domínio');
      domains.setTypeDomain(c.req.param('name'), domain);
      return c.json(knowledge.type(c.req.param('name')));
    })
    .get('/domains', (c) => c.json(domainOverview(s)))
    .post('/domains', async (c) => {
      const pedido = await body(c, CreateDomain);
      if (domains.get(pedido.name)) throw new HttpError(409, 'conflict', `o domínio ${pedido.name} já existe`);
      return c.json(domains.create(pedido), 201);
    })
    // O nome vazio é `comum`, e nenhuma rota tem segmento vazio: a tela manda `-`.
    .get('/domains/:name', (c) => {
      const detail = domainDetail(s, nameOf(c.req.param('name')));
      if ('refused' in detail) throw notFound(detail.refused);
      return c.json(detail);
    })
    .patch('/domains/:name', async (c) => {
      const from = nameOf(c.req.param('name'));
      const { name } = await body(c, RenameDomain);
      if (!from || !domains.get(from)) throw notFound('domínio');
      if (domains.get(name)) throw new HttpError(409, 'conflict', `o domínio ${name} já existe`);
      domains.rename(from, name);
      return c.json(domains.get(name));
    })
    .delete('/domains/:name', (c) => {
      const name = nameOf(c.req.param('name'));
      if (!name || !domains.get(name)) throw notFound('domínio');
      // O que era dele volta para comum: apagar um domínio nunca apaga conhecimento.
      domains.remove(name);
      return c.json({ deleted: true });
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
