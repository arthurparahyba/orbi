import { ProofRepo } from './contexts/procedures/index.ts';
import { RunCallRepo } from './contexts/procedures/index.ts';
import { StepLearningRepo } from './contexts/procedures/index.ts';
import type { DatabaseSync } from 'node:sqlite';
import { mergeEntity, factsForRun } from './contexts/knowledge/index.ts';
import { knownProblemsFor, type KnownProblem } from './contexts/knowledge/index.ts';
import { ulid } from 'ulidx';
import { openDatabase, transaction } from './db/database.ts';
import { edgeProblems, entityProblems, findGaps } from './contexts/knowledge/index.ts';
import { ftsQuery, sharedStems } from './contexts/knowledge/index.ts';
import { advanceRun, newRun, playbookProblems, recordOutputs } from './contexts/procedures/index.ts';
import { Learning } from './contexts/learning/index.ts';
import type { Autonomy, Edge, Entity, Gap, OntologyType, Playbook, PlaybookInput, PlaybookRun, Proposal, ProposalKind, StepStatus } from './language/index.ts';
import { OntologyRepo } from './contexts/knowledge/index.ts';
import { PipelineRepo } from './contexts/procedures/index.ts';
import { pipelineGaps, pipelineProblems, type Pipeline, type PipelineInputDef } from './contexts/procedures/index.ts';
import { playbookParams } from './contexts/procedures/index.ts';
import { GraphRepo } from './contexts/knowledge/index.ts';
import { PlaybookRepo } from './contexts/procedures/index.ts';
import { pipelineConfigProblems } from './contexts/procedures/index.ts';
import { LevelRepo, type AutonomyEvent, type KnownAction } from './contexts/trust/index.ts';
import { PASSAGE_STREAK, type Deviation, type Level, type LevelChange, type LevelState, type RunAction } from './language/index.ts';
import { decideAction, runDeviations, settleLevel } from './contexts/trust/index.ts';
import { ProposalRepo } from './contexts/learning/index.ts';
import { exportMarkdown } from './brain-export.ts';
import { now } from './db/rows.ts';

import { Facts as FactsService } from './contexts/knowledge/index.ts';
import { Procedures as ProceduresService } from './contexts/procedures/index.ts';
import { Autonomy as AutonomyService } from './contexts/trust/index.ts';
import { Execution as ExecutionService } from './contexts/procedures/index.ts';
import { PipelineDefs as PipelineDefsService } from './contexts/procedures/index.ts';
import { Review as ReviewService } from './contexts/improvement/index.ts';
import { ReviewNoteRepo } from './contexts/improvement/index.ts';

export * from './language/index.ts';
export { EXAMPLE_TYPES } from './contexts/knowledge/index.ts';

/**
 * The brain, as the rest of Orbi still calls it — and, since fase 4b of documento 26, an
 * aggregate of the composition rather than a thing of its own: it wires `knowledge`,
 * `procedures`, `trust`, `learning` and the notes of `improvement`, keeps the two reads that
 * cross contexts on purpose (`stats` and `exportMarkdown`), and offers one-line shortcuts to
 * them all.
 *
 * Those shortcuts are declared debt: there are about 400 `brain.x` calls in 74 files, so they
 * are being replaced by the context's own call as each file is touched for another reason.
 * New code asks the context, not this class.
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
  /** What the end-of-run review keeps: ideas, environments to fix, the scope of a change (docs/funcionalidades/19). */
  readonly review: ReviewService;
  /** What was already tried in each procedure (docs/funcionalidades/25). */
  readonly learnings: StepLearningRepo;
  /** What each tool call of an execution did (docs/funcionalidades/24). */
  readonly calls: RunCallRepo;
  /** Which steps of each procedure already ran as they are written (docs/funcionalidades/25). */
  readonly proofs: ProofRepo;
  /** What still waits for the developer, and the batch that lands whole or not at all. */
  readonly learning: Learning;

  /** Takes an open database (shared with the app state) or a file path / ':memory:'. */
  constructor(db: DatabaseSync | string) {
    this.db = typeof db === 'string' ? openDatabase(db) : db;
    this.ontology = new OntologyRepo(this.db);
    this.graphRepo = new GraphRepo(this.db);
    this.playbookRepo = new PlaybookRepo(this.db);
    this.pipelineRepo = new PipelineRepo(this.db);
    this.proposalRepo = new ProposalRepo(this.db);
    this.levels = new LevelRepo(this.db);
    this.proofs = new ProofRepo(this.db);
    this.learnings = new StepLearningRepo(this.db);
    this.calls = new RunCallRepo(this.db);

    this.facts = new FactsService(this.db, this.ontology, this.graphRepo);

    // `trust` decides a procedure's level; `procedures` stores it. The port keeps the dependency
    // one-way (documento 26, fase 4a): the context never reaches back in here.
    this.autonomy = new AutonomyService(this.db, this.levels, {
      get: (name) => this.playbookRepo.get(name),
      setLevel: (name, state) => this.playbookRepo.setLevel(name, state),
      run: (runId) => this.playbookRepo.run(runId),
    });

    this.procedures = new ProceduresService({
      db: this.db,
      playbooks: this.playbookRepo,
      pipelines: this.pipelineRepo,
      proofs: this.proofs,
      learnings: this.learnings,
      facts: this.facts,
      levels: this.levels,
      trust: this.autonomy,
    });

    // A run reads facts and, in step 0, records one (docs/funcionalidades/22) — through the one
    // narrow door `knowledge` opens for it, never its repositories.
    this.execution = new ExecutionService({
      db: this.db,
      playbooks: this.playbookRepo,
      proofs: this.proofs,
      facts: factsForRun(this.ontology, this.graphRepo),
    });

    this.pipelineDefs = new PipelineDefsService({
      db: this.db,
      playbooks: this.playbookRepo,
      pipelines: this.pipelineRepo,
      levels: this.levels,
    });

    this.review = new ReviewService({
      notes: new ReviewNoteRepo(this.db),
      playbooks: this.playbookRepo,
      entity: (id) => this.facts.get(id),
    });

    // The batch lands whole or not at all, and it may carry a fact and a procedure at once, so
    // `learning` owns the transaction that crosses the two (docs/funcionalidades/22).
    this.learning = new Learning({
      db: this.db,
      proposals: this.proposalRepo,
      knowledge: {
        typeOf: (name) => this.facts.type(name),
        entity: (id) => this.facts.get(id),
        upsertType: (type) => this.facts.upsertType(type),
        upsertEntity: (entity) => this.facts.upsertEntity(mergeEntity(this.facts.get(entity.id), entity)),
        addEdge: (edge) => this.facts.addEdge(edge),
      },
      procedures: {
        playbook: (name) => this.playbookRepo.get(name),
        savePlaybook: (playbook) => this.procedures.savePlaybook(playbook),
        savePipeline: (pipeline) => this.pipelineDefs.savePipeline(pipeline),
      },
    });
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

  // ── learning: delegated to the `learning` context, which owns the transaction ──────────
  check: Learning['check'] = (...a) => this.learning.check(...a);
  propose: Learning['propose'] = (...a) => this.learning.propose(...a);
  proposals: Learning['proposals'] = (...a) => this.learning.proposals(...a);
  apply: Learning['apply'] = (...a) => this.learning.apply(...a);
  learn: Learning['learn'] = (...a) => this.learning.learn(...a);
  learnProblems: Learning['learnProblems'] = (...a) => this.learning.learnProblems(...a);

  reject: Learning['reject'] = (...a) => this.learning.reject(...a);

  stats(): { entities: number; edges: number; playbooks: number; openProposals: number; types: number } {
    const { entities, currentEdges } = this.graphRepo.counts();
    return { entities, edges: currentEdges, playbooks: this.playbookRepo.count(), openProposals: this.learning.countOpen(), types: this.ontology.count() };
  }

  exportMarkdown(dir: string): number {
    return exportMarkdown(dir, { entities: this.graphRepo.entities(), playbooks: this.playbooks(), outEdges: (id) => this.neighbors(id).out });
  }
}
