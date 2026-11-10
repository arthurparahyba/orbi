import type { DatabaseSync } from 'node:sqlite';
import { knownProblemsFor, type KnownProblem } from './domain/knowledge.ts';
import { ulid } from 'ulidx';
import { openDatabase, transaction } from '../db/database.ts';
import { edgeProblems, entityProblems, findGaps } from './domain/ontology.ts';
import { ftsQuery, sharedStems } from './domain/similarity.ts';
import { advanceRun, newRun, playbookProblems, recordOutputs } from './domain/playbooks.ts';
import { changeFromProposal, proposalProblems } from './domain/learning.ts';
import type { Autonomy, Edge, Entity, Gap, OntologyType, Playbook, PlaybookInput, PlaybookRun, Proposal, ProposalKind, StepStatus } from './domain/types.ts';
import { OntologyRepo } from './repo/ontology.ts';
import { PipelineRepo } from './repo/pipelines.ts';
import { pipelineGaps, pipelineProblems, type Pipeline, type PipelineInputDef } from './domain/pipelines.ts';
import { playbookParams } from './domain/playbooks.ts';
import { GraphRepo } from './repo/graph.ts';
import { PlaybookRepo } from './repo/playbooks.ts';
import { pipelineConfigProblems } from './domain/review.ts';
import { LevelRepo, type AutonomyEvent, type KnownAction } from './repo/levels.ts';
import {
  decideAction, runDeviations, settleLevel, PASSAGE_STREAK,
  type Deviation, type Level, type LevelChange, type LevelState, type RunAction,
} from './domain/levels.ts';
import { ProposalRepo } from './repo/proposals.ts';
import { exportMarkdown } from './export.ts';
import { now } from './repo/rows.ts';

import type { BrainParts } from './services/parts.ts';
import { Facts as FactsService } from './services/facts.ts';
import { Procedures as ProceduresService } from './services/procedures.ts';
import { Autonomy as AutonomyService } from './services/autonomy.ts';
import { Execution as ExecutionService } from './services/execution.ts';
import { PipelineDefs as PipelineDefsService } from './services/pipelineDefs.ts';

export * from './domain/types.ts';
export { EXAMPLE_TYPES } from './domain/ontology.ts';

/**
 * The brain, as the rest of Orbi uses it. The work is split by subject in brain/services/ (facts,
 * procedures, autonomy, execution, esteiras); this class keeps learning (one batch in one
 * transaction, across subjects) and one-line shortcuts to the services for the code written before
 * the split. Rules stay pure in brain/domain, SQL in brain/repo.
 */
export class BrainStore {
  readonly db: DatabaseSync;
  private readonly ontology: OntologyRepo;
  private readonly graphRepo: GraphRepo;
  private readonly playbookRepo: PlaybookRepo;
  private readonly pipelineRepo: PipelineRepo;
  private readonly proposalRepo: ProposalRepo;
  private readonly levels: LevelRepo;
  /** The brain by subject (brain/services/): new code uses these directly (brain.execution.startRun…). */
  readonly facts: FactsService;
  readonly procedures: ProceduresService;
  readonly autonomy: AutonomyService;
  readonly execution: ExecutionService;
  readonly pipelineDefs: PipelineDefsService;

  /** Takes an open database (shared with the app state) or a file path / ':memory:'. */
  constructor(db: DatabaseSync | string) {
    this.db = typeof db === 'string' ? openDatabase(db) : db;
    this.ontology = new OntologyRepo(this.db);
    this.graphRepo = new GraphRepo(this.db);
    this.playbookRepo = new PlaybookRepo(this.db);
    this.pipelineRepo = new PipelineRepo(this.db);
    this.proposalRepo = new ProposalRepo(this.db);
    this.levels = new LevelRepo(this.db);
    const parts: BrainParts = { db: this.db, ontology: this.ontology, graphRepo: this.graphRepo, playbookRepo: this.playbookRepo, pipelineRepo: this.pipelineRepo, proposalRepo: this.proposalRepo, levels: this.levels };
    this.facts = new FactsService(parts, this);
    this.procedures = new ProceduresService(parts, this);
    this.autonomy = new AutonomyService(parts, this);
    this.execution = new ExecutionService(parts, this);
    this.pipelineDefs = new PipelineDefsService(parts, this);
  }

  // ── facts (services/facts.ts) ──
  upsertType: FactsService['upsertType'] = (...a) => this.facts.upsertType(...a);
  types: FactsService['types'] = (...a) => this.facts.types(...a);
  type: FactsService['type'] = (...a) => this.facts.type(...a);
  validateEntity: FactsService['validateEntity'] = (...a) => this.facts.validateEntity(...a);
  validateEdge: FactsService['validateEdge'] = (...a) => this.facts.validateEdge(...a);
  upsertEntity: FactsService['upsertEntity'] = (...a) => this.facts.upsertEntity(...a);
  editEntity: FactsService['editEntity'] = (...a) => this.facts.editEntity(...a);
  entityDependents: FactsService['entityDependents'] = (...a) => this.facts.entityDependents(...a);
  deleteEntity: FactsService['deleteEntity'] = (...a) => this.facts.deleteEntity(...a);
  addEdge: FactsService['addEdge'] = (...a) => this.facts.addEdge(...a);
  get: FactsService['get'] = (...a) => this.facts.get(...a);
  byType: FactsService['byType'] = (...a) => this.facts.byType(...a);
  neighbors: FactsService['neighbors'] = (...a) => this.facts.neighbors(...a);
  reachable: FactsService['reachable'] = (...a) => this.facts.reachable(...a);
  search: FactsService['search'] = (...a) => this.facts.search(...a);
  gaps: FactsService['gaps'] = (...a) => this.facts.gaps(...a);
  graph: FactsService['graph'] = (...a) => this.facts.graph(...a);
  // ── procedures (services/procedures.ts) ──
  savePlaybook: ProceduresService['savePlaybook'] = (...a) => this.procedures.savePlaybook(...a);
  editPlaybook: ProceduresService['editPlaybook'] = (...a) => this.procedures.editPlaybook(...a);
  deletePlaybook: ProceduresService['deletePlaybook'] = (...a) => this.procedures.deletePlaybook(...a);
  setPlaybookAutonomy: ProceduresService['setPlaybookAutonomy'] = (...a) => this.procedures.setPlaybookAutonomy(...a);
  playbook: ProceduresService['playbook'] = (...a) => this.procedures.playbook(...a);
  playbooks: ProceduresService['playbooks'] = (...a) => this.procedures.playbooks(...a);
  searchPlaybooks: ProceduresService['searchPlaybooks'] = (...a) => this.procedures.searchPlaybooks(...a);
  // ── autonomy (services/autonomy.ts) ──
  setPlaybookLevel: AutonomyService['setPlaybookLevel'] = (...a) => this.autonomy.setPlaybookLevel(...a);
  isKnownAction: AutonomyService['isKnownAction'] = (...a) => this.autonomy.isKnownAction(...a);
  knownActions: AutonomyService['knownActions'] = (...a) => this.autonomy.knownActions(...a);
  autonomyEvents: AutonomyService['autonomyEvents'] = (...a) => this.autonomy.autonomyEvents(...a);
  addAutonomyEvent: AutonomyService['addAutonomyEvent'] = (...a) => this.autonomy.addAutonomyEvent(...a);
  settleRun: AutonomyService['settleRun'] = (...a) => this.autonomy.settleRun(...a);
  // ── execution (services/execution.ts) ──
  recordRunAction: ExecutionService['recordRunAction'] = (...a) => this.execution.recordRunAction(...a);
  addRunDeviation: ExecutionService['addRunDeviation'] = (...a) => this.execution.addRunDeviation(...a);
  recoverRunDeviation: ExecutionService['recoverRunDeviation'] = (...a) => this.execution.recoverRunDeviation(...a);
  noteCommand: ExecutionService['noteCommand'] = (...a) => this.execution.noteCommand(...a);
  knownProblems: ExecutionService['knownProblems'] = (...a) => this.execution.knownProblems(...a);
  openRunIn: ExecutionService['openRunIn'] = (...a) => this.execution.openRunIn(...a);
  runForFailureIn: ExecutionService['runForFailureIn'] = (...a) => this.execution.runForFailureIn(...a);
  openUnreviewedRunsIn: ExecutionService['openUnreviewedRunsIn'] = (...a) => this.execution.openUnreviewedRunsIn(...a);
  unreviewedRunsIn: ExecutionService['unreviewedRunsIn'] = (...a) => this.execution.unreviewedRunsIn(...a);
  markReviewed: ExecutionService['markReviewed'] = (...a) => this.execution.markReviewed(...a);
  startRun: ExecutionService['startRun'] = (...a) => this.execution.startRun(...a);
  updateRunStep: ExecutionService['updateRunStep'] = (...a) => this.execution.updateRunStep(...a);
  run: ExecutionService['run'] = (...a) => this.execution.run(...a);
  runs: ExecutionService['runs'] = (...a) => this.execution.runs(...a);
  lastRunIn: ExecutionService['lastRunIn'] = (...a) => this.execution.lastRunIn(...a);
  // ── pipelinedefs (services/pipelineDefs.ts) ──
  savePipeline: PipelineDefsService['savePipeline'] = (...a) => this.pipelineDefs.savePipeline(...a);
  pipeline: PipelineDefsService['pipeline'] = (...a) => this.pipelineDefs.pipeline(...a);
  pipelines: PipelineDefsService['pipelines'] = (...a) => this.pipelineDefs.pipelines(...a);
  deletePipeline: PipelineDefsService['deletePipeline'] = (...a) => this.pipelineDefs.deletePipeline(...a);
  countPipelineUse: PipelineDefsService['countPipelineUse'] = (...a) => this.pipelineDefs.countPipelineUse(...a);
  pipelineGaps: PipelineDefsService['pipelineGaps'] = (...a) => this.pipelineDefs.pipelineGaps(...a);
  notePassage: PipelineDefsService['notePassage'] = (...a) => this.pipelineDefs.notePassage(...a);
  keepPassageAsking: PipelineDefsService['keepPassageAsking'] = (...a) => this.pipelineDefs.keepPassageAsking(...a);
  passageStreaks: PipelineDefsService['passageStreaks'] = (...a) => this.pipelineDefs.passageStreaks(...a);
  pipelineWarnings: PipelineDefsService['pipelineWarnings'] = (...a) => this.pipelineDefs.pipelineWarnings(...a);
  pipelinesUsing: PipelineDefsService['pipelinesUsing'] = (...a) => this.pipelineDefs.pipelinesUsing(...a);

  // ── learning (waits for the developer) ─────────────────────────────────
  check(kind: ProposalKind, payload: Record<string, unknown>): string[] {
    return proposalProblems(kind, payload, { typeOf: this.facts.typeOf, entity: (id) => this.get(id), playbook: (name) => this.playbookRepo.get(name) });
  }

  propose(kind: ProposalKind, payload: Record<string, unknown>, reason: string, conversationId: string): Proposal {
    const problems = this.check(kind, payload);
    if (problems.length) throw new Error(`proposta inválida: ${problems.join('; ')}`);
    const proposal: Proposal = { id: ulid(), kind, payload, reason, conversationId, status: 'open', createdAt: now() };
    this.proposalRepo.insert(proposal);
    return proposal;
  }

  proposals(status: Proposal['status'] = 'open'): Proposal[] {
    return this.proposalRepo.list(status);
  }

  /** Apply an approved proposal to the brain. */
  apply(proposalId: string): string {
    const proposal = this.proposalRepo.get(proposalId);
    if (!proposal) throw new Error(`proposta não encontrada ou já decidida: ${proposalId}`);
    const change = changeFromProposal(proposal.kind, proposal.payload, proposal.conversationId);
    transaction(this.db, () => {
      if (change.kind === 'type') this.upsertType(change.type);
      else if (change.kind === 'entity') this.upsertEntity(change.entity);
      else if (change.kind === 'edge') this.addEdge(change.edge);
      else if (change.kind === 'pipeline') this.savePipeline(change.pipeline);
      else this.savePlaybook(change.playbook);
      this.proposalRepo.setStatus(proposalId, 'applied');
    });
    return change.label;
  }

  /**
   * Learns a whole batch at once (all of it lands, or none), in the order
   * given: types first, so an entity can use a type from the same batch.
   */
  learn(items: Array<{ kind: ProposalKind; payload: Record<string, unknown> }>, reason: string, conversationId: string): string[] {
    return transaction(this.db, () => items.map((item) => this.apply(this.propose(item.kind, item.payload, reason, conversationId).id)));
  }

  /** What would go wrong learning this batch, without keeping anything (checked before asking the developer). */
  learnProblems(items: Array<{ kind: ProposalKind; payload: Record<string, unknown> }>): string[] {
    const problems: string[] = [];
    transaction(
      this.db,
      () => {
        for (const item of items) {
          try {
            transaction(this.db, () => this.apply(this.propose(item.kind, item.payload, 'verificação', '').id));
          } catch (error) {
            const label = String(item.payload.name ?? item.payload.id ?? `${item.payload.from} → ${item.payload.to}`);
            problems.push(`${item.kind} ${label}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      },
      { rollback: true },
    );
    return problems;
  }

  reject(proposalId: string): void {
    this.proposalRepo.setStatus(proposalId, 'rejected');
  }

  stats(): { entities: number; edges: number; playbooks: number; openProposals: number; types: number } {
    const { entities, currentEdges } = this.graphRepo.counts();
    return { entities, edges: currentEdges, playbooks: this.playbookRepo.count(), openProposals: this.proposalRepo.countOpen(), types: this.ontology.count() };
  }

  exportMarkdown(dir: string): number {
    return exportMarkdown(dir, { entities: this.graphRepo.entities(), playbooks: this.playbooks(), outEdges: (id) => this.neighbors(id).out });
  }
}
