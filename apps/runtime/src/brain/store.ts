import type { DatabaseSync } from 'node:sqlite';
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
import { FollowupRepo, type DueFollowup } from './repo/followups.ts';
import { exportMarkdown } from './export.ts';
import { now } from './repo/rows.ts';

export * from './domain/types.ts';
export { EXAMPLE_TYPES } from './domain/ontology.ts';

/**
 * The brain, as the rest of Orbi uses it: one object that applies the rules in
 * brain/domain (pure) and stores through the repositories in brain/repo (SQL).
 */
export class BrainStore {
  readonly db: DatabaseSync;
  private readonly ontology: OntologyRepo;
  private readonly graphRepo: GraphRepo;
  private readonly playbookRepo: PlaybookRepo;
  private readonly pipelineRepo: PipelineRepo;
  private readonly proposalRepo: ProposalRepo;
  private readonly followups: FollowupRepo;
  private readonly levels: LevelRepo;

  /** Takes an open database (shared with the app state) or a file path / ':memory:'. */
  constructor(db: DatabaseSync | string) {
    this.db = typeof db === 'string' ? openDatabase(db) : db;
    this.ontology = new OntologyRepo(this.db);
    this.graphRepo = new GraphRepo(this.db);
    this.playbookRepo = new PlaybookRepo(this.db);
    this.pipelineRepo = new PipelineRepo(this.db);
    this.proposalRepo = new ProposalRepo(this.db);
    this.followups = new FollowupRepo(this.db);
    this.levels = new LevelRepo(this.db);
  }

  // ── ontology ────────────────────────────────────────────────────────────
  upsertType(type: OntologyType): void {
    this.ontology.upsert(type);
  }
  types(): OntologyType[] {
    return this.ontology.all();
  }
  type(name: string): OntologyType | undefined {
    return this.ontology.get(name);
  }
  private readonly typeOf = (name: string) => this.ontology.get(name);

  // ── graph ───────────────────────────────────────────────────────────────
  validateEntity(entity: Pick<Entity, 'id' | 'type'>): string[] {
    return entityProblems(entity, this.typeOf);
  }
  validateEdge(edge: Pick<Edge, 'from' | 'rel' | 'to'>): string[] {
    return edgeProblems(edge, this.get(edge.from), this.get(edge.to), this.typeOf);
  }

  upsertEntity(entity: Omit<Entity, 'updatedAt'>): Entity {
    const problems = this.validateEntity(entity);
    if (problems.length) throw new Error(problems.join('; '));
    return this.graphRepo.upsertEntity(entity);
  }

  /** The developer edits an entity on the Cérebro screen: properties and text (type and id stay). */
  editEntity(id: string, change: { props?: Record<string, unknown>; body?: string }): Entity {
    const current = this.get(id);
    if (!current) throw new Error(`entidade não encontrada: ${id}`);
    return this.upsertEntity({ id, type: current.type, props: change.props ?? current.props, body: change.body ?? current.body });
  }

  /** What deleting an entity takes along: its relations, current and past. */
  entityDependents(id: string): { relations: number } {
    return { relations: this.graphRepo.edgeCount(id) };
  }

  deleteEntity(id: string): { relations: number } {
    if (!this.get(id)) throw new Error(`entidade não encontrada: ${id}`);
    let relations = 0;
    transaction(this.db, () => {
      relations = this.graphRepo.deleteEntity(id);
    });
    return { relations };
  }

  /** Add a fact. Edges are temporal: `validTo` lets "Marina approves until 31/12" expire by itself. */
  addEdge(edge: { from: string; rel: string; to: string; attrs?: Record<string, unknown>; validFrom?: string; validTo?: string | null }): Edge {
    const problems = this.validateEdge(edge);
    if (problems.length) throw new Error(problems.join('; '));
    const row: Edge = { from: edge.from, rel: edge.rel, to: edge.to, attrs: edge.attrs ?? {}, validFrom: edge.validFrom ?? now(), validTo: edge.validTo ?? null };
    this.graphRepo.insertEdge(row);
    return row;
  }

  get(id: string): Entity | undefined {
    return this.graphRepo.entity(id);
  }
  byType(type: string): Entity[] {
    return this.graphRepo.byType(type);
  }
  neighbors(id: string, options: { rel?: string; at?: string } = {}): { out: Edge[]; in: Edge[] } {
    return this.graphRepo.neighbors(id, options.at ?? now(), options.rel);
  }
  reachable(id: string, depth = 2): Array<{ id: string; depth: number }> {
    return this.graphRepo.reachable(id, depth, now());
  }
  /** Entities for a text, best first (full-text index; see domain/similarity.ts). */
  search(text: string, limit = 10): Entity[] {
    return this.graphRepo.search(ftsQuery(text), limit);
  }
  gaps(): Gap[] {
    const at = now();
    return findGaps(this.graphRepo.entities(), (id) => this.graphRepo.neighbors(id, at).out, this.typeOf);
  }
  graph(): { types: OntologyType[]; entities: Entity[]; edges: Edge[] } {
    return { types: this.types(), entities: this.graphRepo.entities(), edges: this.graphRepo.edges() };
  }

  // ── playbooks ───────────────────────────────────────────────────────────
  savePlaybook(pb: PlaybookInput): Playbook {
    // Scripts left out of a change stay as they were (and the steps are checked against them).
    const before = this.playbookRepo.get(pb.name);
    const scripts = pb.scripts ?? before?.scripts ?? [];
    const problems = playbookProblems({ ...pb, scripts });
    if (pb.variationOf && (pb.variationOf === pb.name || !this.playbookRepo.get(pb.variationOf))) {
      problems.push(`variationOf: playbook base não existe: ${pb.variationOf}`);
    }
    if (problems.length) throw new Error(problems.join('; '));
    // Editing the steps keeps the level: a changed step runs other actions, and new actions ask anyway.
    this.playbookRepo.save({ ...pb, scripts });
    return this.playbookRepo.get(pb.name)!;
  }
  /** The developer edits a playbook on the Cérebro screen. Name, autonomy, base and counters stay. */
  editPlaybook(name: string, change: Partial<Pick<Playbook, 'description' | 'trigger' | 'appliesTo' | 'steps' | 'instructions' | 'outputs' | 'scripts'>>): Playbook {
    const current = this.playbookRepo.get(name);
    if (!current) throw new Error(`playbook não encontrado: ${name}`);
    const { uses: _u, successes: _s, updatedAt: _t, ...rest } = current;
    return this.savePlaybook({ ...rest, ...change });
  }

  /** Deletes a playbook. Variations stay (unlinked); past runs stay in Execuções. */
  deletePlaybook(name: string): { detachedVariations: string[] } {
    if (!this.playbookRepo.get(name)) throw new Error(`playbook não encontrado: ${name}`);
    const using = this.pipelineRepo.using(name);
    if (using.length) throw new Error(`o procedimento ${name} está nas esteiras ${using.join(', ')}: tire-o delas antes de apagar`);
    let detachedVariations: string[] = [];
    transaction(this.db, () => {
      detachedVariations = this.playbookRepo.delete(name);
      this.levels.forget(name);
    });
    return { detachedVariations };
  }

  /** observe: only reports. ask and auto are shortcuts for N1 and N3, set by the developer. */
  setPlaybookAutonomy(name: string, autonomy: Autonomy): Playbook {
    const pb = this.playbookRepo.get(name);
    if (!pb) throw new Error(`playbook não encontrado: ${name}`);
    this.playbookRepo.setAutonomy(name, autonomy);
    // Leaving "só observar" keeps the level it had; otherwise ask/auto choose N1/N3.
    if (pb.autonomy === 'observe' && autonomy !== 'observe') this.playbookRepo.setLevel(name, levelState(pb));
    else if (autonomy !== 'observe') this.setPlaybookLevel(name, { level: autonomy === 'auto' ? 3 : 1 });
    return this.playbookRepo.get(name)!;
  }

  // ── autonomy that grows with use (domain/levels.ts) ──────────────────────
  /** The developer sets the level or its ceiling (Cérebro, or "Manter em N1"). */
  setPlaybookLevel(name: string, change: { level?: Level; levelMax?: Level }, conversationId: string | null = null): Playbook {
    const pb = this.playbookRepo.get(name);
    if (!pb) throw new Error(`playbook não encontrado: ${name}`);
    const levelMax = change.levelMax ?? pb.levelMax;
    const level = Math.min(change.level ?? pb.level, levelMax) as Level;
    this.playbookRepo.setLevel(name, { level, levelMax, levelBy: change.level !== undefined || level !== pb.level ? 'user' : pb.levelBy, cleanStreak: level === pb.level ? pb.cleanStreak : 0 });
    if (level !== pb.level) this.levels.addEvent({ subjectKind: 'playbook', subject: name, from: `N${pb.level}`, to: `N${level}`, reason: 'você mudou', conversationId });
    if (levelMax !== pb.levelMax) this.levels.addEvent({ subjectKind: 'playbook', subject: name, from: `teto N${pb.levelMax}`, to: `teto N${levelMax}`, reason: 'você mudou', conversationId });
    return this.playbookRepo.get(name)!;
  }
  isKnownAction(playbook: string, fingerprint: string): boolean {
    return this.levels.isKnown(playbook, fingerprint);
  }
  knownActions(playbook: string): KnownAction[] {
    return this.levels.known(playbook);
  }
  autonomyEvents(kind: AutonomyEvent['subjectKind'], subject: string): AutonomyEvent[] {
    return this.levels.events(kind, subject);
  }
  addAutonomyEvent(e: Omit<AutonomyEvent, 'id' | 'createdAt'>): AutonomyEvent {
    return this.levels.addEvent(e);
  }
  /** An action a run carried out (the gate calls it after running). */
  recordRunAction(runId: string, action: RunAction): void {
    const run = this.playbookRepo.run(runId);
    if (!run || run.actions.some((a) => a.fingerprint === action.fingerprint)) return;
    this.playbookRepo.setRunTrail(runId, [...run.actions, action], run.deviations);
  }
  /** Something went off the path in a run: a tool failed, an action was denied. */
  addRunDeviation(runId: string, deviation: Omit<Deviation, 'at'>): void {
    const run = this.playbookRepo.run(runId);
    if (!run) return;
    const last = run.deviations.at(-1);
    if (last && last.detail === deviation.detail && last.step === (deviation.step ?? null)) return; // the same failure, reported twice
    this.playbookRepo.setRunTrail(runId, run.actions, [...run.deviations, { ...deviation, step: deviation.step ?? null, at: now() }]);
  }
  /** The run still going on in a conversation, if any. */
  openRunIn(conversationId: string): PlaybookRun | undefined {
    const run = this.playbookRepo.lastRunIn(conversationId);
    return run && (run.status === 'running' || run.status === 'waiting') ? run : undefined;
  }
  /**
   * Where a tool failure belongs: the run going on, or the one that just ended and was not
   * reviewed yet (tools called in parallel report after the step that closed the run).
   */
  runForFailureIn(conversationId: string): PlaybookRun | undefined {
    return this.openRunIn(conversationId) ?? this.playbookRepo.unreviewedIn(conversationId).at(-1);
  }
  openUnreviewedRunsIn(conversationId: string): PlaybookRun[] {
    return this.playbookRepo.openUnreviewedIn(conversationId);
  }
  unreviewedRunsIn(conversationId: string): PlaybookRun[] {
    return this.playbookRepo.unreviewedIn(conversationId);
  }
  markReviewed(runId: string): void {
    this.playbookRepo.markReviewed(runId);
  }
  /**
   * After a run ends: a clean run teaches its actions and may raise the level; a failure or a
   * denial lowers it. Returns the change (if any), what kept it from counting, and what the
   * playbook now does alone or still asks.
   */
  settleRun(runId: string): { change: LevelChange | null; deviations: string[]; level: Level; alone: string[]; asks: string[] } {
    const run = this.playbookRepo.run(runId);
    const pb = run && this.playbookRepo.get(run.playbook);
    if (!run || !pb) throw new Error(`execução não encontrada: ${runId}`);
    const deviations = runDeviations(run);
    const clean = run.status === 'done' && deviations.length === 0;
    const { state, change } = settleLevel(levelState(pb), {
      clean,
      denied: run.deviations.some((d) => d.kind === 'negado'),
      failed: run.status === 'failed',
    });
    transaction(this.db, () => {
      if (clean) this.levels.learn(pb.name, run.actions);
      this.playbookRepo.setLevel(pb.name, state);
      if (change) this.levels.addEvent({ subjectKind: 'playbook', subject: pb.name, from: `N${change.from}`, to: `N${change.to}`, reason: change.reason, conversationId: run.conversationId });
    });
    const alone: string[] = [];
    const asks: string[] = [];
    for (const k of this.levels.known(pb.name)) {
      if (k.effect === 'leitura') continue;
      (decideAction(state, { known: true, effect: k.effect }) === 'auto' ? alone : asks).push(k.summary);
    }
    return { change, deviations, level: state.level, alone, asks };
  }
  playbook(name: string): Playbook | undefined {
    return this.playbookRepo.get(name);
  }
  playbooks(): Playbook[] {
    return this.playbookRepo.all();
  }
  /** Playbooks for a request, best first, with the stems they share with it. */
  searchPlaybooks(text: string, limit = 3): Array<{ playbook: Playbook; shared: string[] }> {
    return this.playbookRepo.search(ftsQuery(text), limit).map((playbook) => ({
      playbook,
      shared: sharedStems(text, [playbook.name, playbook.description, playbook.trigger, ...playbook.steps.map((s) => `${s.label} ${s.how}`)].join(' ')),
    }));
  }

  startRun(playbookName: string, conversationId: string, params: Record<string, string> = {}): PlaybookRun {
    const pb = this.playbookRepo.get(playbookName);
    if (!pb) throw new Error(`playbook não encontrado: ${playbookName}`);
    const run = newRun(pb, ulid(), conversationId, params, now());
    transaction(this.db, () => {
      this.playbookRepo.insertRun(run);
      this.playbookRepo.countUse(pb.name);
    });
    return run;
  }

  updateRunStep(runId: string, stepId: string, status: StepStatus, note?: string, outputs?: Record<string, string>): PlaybookRun {
    const current = this.playbookRepo.run(runId);
    if (!current) throw new Error(`execução não encontrada: ${runId}`);
    let run = advanceRun(current, stepId, status, note, now());
    if (outputs && Object.keys(outputs).length) run = recordOutputs(run, this.playbookRepo.get(run.playbook)?.outputs ?? [], outputs);
    transaction(this.db, () => {
      this.playbookRepo.updateRun(run);
      if (run.status === 'done' && current.status !== 'done') this.playbookRepo.countSuccess(run.playbook);
    });
    return run;
  }
  run(id: string): PlaybookRun | undefined {
    return this.playbookRepo.run(id);
  }
  runs(limit = 20): PlaybookRun[] {
    return this.playbookRepo.runs(limit);
  }
  lastRunIn(conversationId: string): PlaybookRun | undefined {
    return this.playbookRepo.lastRunIn(conversationId);
  }

  // ── esteiras (procedures in sequence) ─────────────────────────────────
  savePipeline(p: PipelineInputDef): Pipeline {
    const problems = pipelineProblems(p, (name) => this.playbookRepo.get(name));
    if (problems.length) throw new Error(problems.join('; '));
    this.pipelineRepo.save(p);
    return this.pipelineRepo.get(p.name)!;
  }
  pipeline(name: string): Pipeline | undefined {
    return this.pipelineRepo.get(name);
  }
  pipelines(): Pipeline[] {
    return this.pipelineRepo.all();
  }
  deletePipeline(name: string): boolean {
    return this.pipelineRepo.delete(name);
  }
  countPipelineUse(name: string): void {
    this.pipelineRepo.countUse(name);
  }
  /** Parameters no stage hands over and no input gives: the Orbi will ask when it gets there. */
  pipelineGaps(p: PipelineInputDef) {
    return pipelineGaps(p, (name) => this.playbookRepo.get(name), (pb) => playbookParams(pb));
  }
  /**
   * The developer decided on a passage that asks. After PASSAGE_STREAK times "go on" in a row,
   * the passage goes on by itself; "stop" starts the count again. Returns the change, if any.
   */
  notePassage(name: string, stageId: string, continued: boolean, conversationId: string | null): { from: string; to: string; reason: string } | null {
    const p = this.pipelineRepo.get(name);
    const stage = p?.stages.find((s) => s.id === stageId);
    if (!p || !stage || stage.passage !== 'ask') return null;
    const streaks = this.pipelineRepo.passageStreaks(name);
    const count = continued ? (streaks[stageId] ?? 0) + 1 : 0;
    if (count < PASSAGE_STREAK) {
      this.pipelineRepo.setPassageStreaks(name, { ...streaks, [stageId]: count });
      return null;
    }
    const reason = `você seguiu ${PASSAGE_STREAK} vezes seguidas`;
    transaction(this.db, () => {
      this.pipelineRepo.save({ ...p, stages: p.stages.map((s) => (s.id === stageId ? { ...s, passage: 'auto' as const } : s)) });
      this.pipelineRepo.setPassageStreaks(name, { ...streaks, [stageId]: 0 });
      this.levels.addEvent({ subjectKind: 'passage', subject: `${name}/${stageId}`, from: 'pergunta', to: 'segue', reason, conversationId });
    });
    return { from: 'pergunta', to: 'segue', reason };
  }
  /** "Manter perguntando": the passage asks again, and the count starts over. */
  keepPassageAsking(name: string, stageId: string, conversationId: string | null): void {
    const p = this.pipelineRepo.get(name);
    if (!p || !p.stages.some((s) => s.id === stageId)) throw new Error(`etapa não encontrada: ${name}/${stageId}`);
    transaction(this.db, () => {
      this.pipelineRepo.save({ ...p, stages: p.stages.map((s) => (s.id === stageId ? { ...s, passage: 'ask' as const } : s)) });
      this.pipelineRepo.setPassageStreaks(name, { ...this.pipelineRepo.passageStreaks(name), [stageId]: 0 });
      this.levels.addEvent({ subjectKind: 'passage', subject: `${name}/${stageId}`, from: 'segue', to: 'pergunta', reason: 'você mudou', conversationId });
    });
  }
  passageStreaks(name: string): Record<string, number> {
    return this.pipelineRepo.passageStreaks(name);
  }

  /** Configuration problems of an esteira (data that does not flow, steps that ask, fixed values). */
  pipelineWarnings(p: PipelineInputDef, delivered: Record<string, Record<string, string>> = {}) {
    return pipelineConfigProblems(p, (name) => this.playbookRepo.get(name), delivered);
  }
  /** Esteiras that use a playbook. */
  pipelinesUsing(playbook: string): string[] {
    return this.pipelineRepo.using(playbook);
  }

  // ── learning (waits for the developer) ─────────────────────────────────
  check(kind: ProposalKind, payload: Record<string, unknown>): string[] {
    return proposalProblems(kind, payload, { typeOf: this.typeOf, entity: (id) => this.get(id), playbook: (name) => this.playbookRepo.get(name) });
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

  // ── follow-ups ──────────────────────────────────────────────────────────
  scheduleFollowup(conversationId: string, dueAt: string, note: string): string {
    const id = ulid();
    this.followups.schedule(id, conversationId, dueAt, note);
    return id;
  }
  claimDueFollowups(at = now()): DueFollowup[] {
    return this.followups.claimDue(at);
  }

  stats(): { entities: number; edges: number; playbooks: number; openProposals: number; types: number } {
    const { entities, currentEdges } = this.graphRepo.counts();
    return { entities, edges: currentEdges, playbooks: this.playbookRepo.count(), openProposals: this.proposalRepo.countOpen(), types: this.ontology.count() };
  }

  exportMarkdown(dir: string): number {
    return exportMarkdown(dir, { entities: this.graphRepo.entities(), playbooks: this.playbooks(), outEdges: (id) => this.neighbors(id).out });
  }
}

const levelState = (pb: Playbook): LevelState => ({ level: pb.level, levelMax: pb.levelMax, levelBy: pb.levelBy, cleanStreak: pb.cleanStreak });
