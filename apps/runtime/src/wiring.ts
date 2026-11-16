import type { DatabaseSync } from 'node:sqlite';
import { Facts, GraphRepo, OntologyRepo, factsForRun, mergeEntity } from './contexts/knowledge/index.ts';
import { Execution, PipelineDefs, PipelineRepo, PlaybookRepo, Procedures, ProofRepo, RunCallRepo, StepLearningRepo } from './contexts/procedures/index.ts';
import { Autonomy, LevelRepo } from './contexts/trust/index.ts';
import { Learning, ProposalRepo } from './contexts/learning/index.ts';
import { Review, ReviewNoteRepo } from './contexts/improvement/index.ts';
import type { OrbiServices } from './services.ts';

/**
 * Wires the contexts that share the database, and only here: each one takes its own repositories
 * and, for a neighbour, the narrow port that neighbour opened (documento 26). Nothing in this
 * file decides anything — if a line here grows a rule, the rule belongs to a context.
 *
 * This replaced the old `BrainStore`, which held the same objects behind 63 one-line shortcuts:
 * `brain.playbook(x)` said nothing about where it went, and ten capabilities declared
 * `needs: ['brain']` when they wanted one context. Now a call names the context it asks.
 */
/** The contexts that share the database, as the composition and the tests hold them. */
export type Contexts = Pick<OrbiServices, 'knowledge' | 'procedures' | 'trust' | 'learning' | 'notes'>;

export function wireContexts(db: DatabaseSync): Contexts {
  const ontology = new OntologyRepo(db);
  const graph = new GraphRepo(db);
  const playbooks = new PlaybookRepo(db);
  const pipelines = new PipelineRepo(db);
  const proposals = new ProposalRepo(db);
  const levels = new LevelRepo(db);
  const proofs = new ProofRepo(db);
  const learnings = new StepLearningRepo(db);
  const calls = new RunCallRepo(db);

  const knowledge = new Facts(db, ontology, graph);

  // `trust` decides a procedure's level; `procedures` stores it. The port keeps the dependency
  // one-way (documento 26, fase 4a): the context never reaches back into procedures.
  const trust = new Autonomy(db, levels, {
    get: (name) => playbooks.get(name),
    setLevel: (name, state) => playbooks.setLevel(name, state),
    run: (runId) => playbooks.run(runId),
  });

  const definition = new Procedures({ db, playbooks, pipelines, proofs, learnings, facts: knowledge, levels, trust });

  // A run reads facts and, in step 0, records one (docs/funcionalidades/22) — through the one
  // narrow door `knowledge` opens for it, never its repositories.
  const execution = new Execution({ db, playbooks, proofs, facts: factsForRun(ontology, graph) });

  const pipelineDefs = new PipelineDefs({ db, playbooks, pipelines, levels });

  const notes = new Review({ notes: new ReviewNoteRepo(db), playbooks, entity: (id) => knowledge.get(id) });

  // The batch lands whole or not at all, and it may carry a fact and a procedure at once, so
  // `learning` owns the transaction that crosses the two (docs/funcionalidades/22).
  const learning = new Learning({
    db,
    proposals,
    knowledge: {
      typeOf: (name) => knowledge.type(name),
      entity: (id) => knowledge.get(id),
      upsertType: (type) => knowledge.upsertType(type),
      upsertEntity: (entity) => knowledge.upsertEntity(mergeEntity(knowledge.get(entity.id), entity)),
      addEdge: (edge) => knowledge.addEdge(edge),
    },
    procedures: {
      playbook: (name) => playbooks.get(name),
      savePlaybook: (playbook) => definition.savePlaybook(playbook),
      savePipeline: (pipeline) => pipelineDefs.savePipeline(pipeline),
    },
  });

  return { knowledge, procedures: { definition, execution, pipelineDefs, proofs, learnings, calls }, trust, learning, notes };
}
