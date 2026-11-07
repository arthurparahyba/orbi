import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import { openDatabase, transaction } from '../db/database.ts';
import { edgeProblems, entityProblems, findGaps } from './domain/ontology.ts';
import { ftsQuery, sharedStems } from './domain/similarity.ts';
import { advanceRun, newRun, playbookProblems } from './domain/playbooks.ts';
import { changeFromProposal, proposalProblems } from './domain/learning.ts';
import type { Autonomy, Edge, Entity, Gap, OntologyType, Playbook, PlaybookRun, Proposal, ProposalKind, StepStatus } from './domain/types.ts';
import { OntologyRepo } from './repo/ontology.ts';
import { GraphRepo } from './repo/graph.ts';
import { PlaybookRepo } from './repo/playbooks.ts';
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
  private readonly proposalRepo: ProposalRepo;
  private readonly followups: FollowupRepo;

  /** Takes an open database (shared with the app state) or a file path / ':memory:'. */
  constructor(db: DatabaseSync | string) {
    this.db = typeof db === 'string' ? openDatabase(db) : db;
    this.ontology = new OntologyRepo(this.db);
    this.graphRepo = new GraphRepo(this.db);
    this.playbookRepo = new PlaybookRepo(this.db);
    this.proposalRepo = new ProposalRepo(this.db);
    this.followups = new FollowupRepo(this.db);
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
  savePlaybook(pb: Omit<Playbook, 'uses' | 'successes' | 'updatedAt'>): Playbook {
    const problems = playbookProblems(pb);
    if (pb.variationOf && (pb.variationOf === pb.name || !this.playbookRepo.get(pb.variationOf))) {
      problems.push(`variationOf: playbook base não existe: ${pb.variationOf}`);
    }
    if (problems.length) throw new Error(problems.join('; '));
    this.playbookRepo.save(pb);
    return this.playbookRepo.get(pb.name)!;
  }
  /** The developer edits a playbook on the Cérebro screen. Name, autonomy, base and counters stay. */
  editPlaybook(name: string, change: Partial<Pick<Playbook, 'description' | 'trigger' | 'appliesTo' | 'steps' | 'instructions'>>): Playbook {
    const current = this.playbookRepo.get(name);
    if (!current) throw new Error(`playbook não encontrado: ${name}`);
    const { uses: _u, successes: _s, updatedAt: _t, ...rest } = current;
    return this.savePlaybook({ ...rest, ...change });
  }

  /** Deletes a playbook. Variations stay (unlinked); past runs stay in Execuções. */
  deletePlaybook(name: string): { detachedVariations: string[] } {
    if (!this.playbookRepo.get(name)) throw new Error(`playbook não encontrado: ${name}`);
    let detachedVariations: string[] = [];
    transaction(this.db, () => {
      detachedVariations = this.playbookRepo.delete(name);
    });
    return { detachedVariations };
  }

  setPlaybookAutonomy(name: string, autonomy: Autonomy): Playbook {
    if (!this.playbookRepo.get(name)) throw new Error(`playbook não encontrado: ${name}`);
    this.playbookRepo.setAutonomy(name, autonomy);
    return this.playbookRepo.get(name)!;
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

  updateRunStep(runId: string, stepId: string, status: StepStatus, note?: string): PlaybookRun {
    const current = this.playbookRepo.run(runId);
    if (!current) throw new Error(`execução não encontrada: ${runId}`);
    const run = advanceRun(current, stepId, status, note, now());
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

  // ── learning (waits for the developer) ─────────────────────────────────
  check(kind: ProposalKind, payload: Record<string, unknown>): string[] {
    return proposalProblems(kind, payload, { typeOf: this.typeOf, entity: (id) => this.get(id) });
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
