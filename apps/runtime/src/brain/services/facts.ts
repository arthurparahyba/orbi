import { transaction } from '../../db/database.ts';
import { edgeProblems, entityProblems, findGaps } from '../domain/ontology.ts';
import { ftsQuery } from '../domain/similarity.ts';
import type { Edge, Entity, Gap, OntologyType } from '../domain/types.ts';
import { now } from '../repo/rows.ts';
import type { BrainParts } from './parts.ts';
import type { BrainStore } from '../store.ts';

/** The facts: ontology (types), entities and the edges between them, and their search. */
export class Facts {
  constructor(private readonly p: BrainParts, private readonly brain: BrainStore) {}

  // ── ontology ────────────────────────────────────────────────────────────
  upsertType(type: OntologyType): void {
    this.p.ontology.upsert(type);
  }

  types(): OntologyType[] {
    return this.p.ontology.all();
  }

  type(name: string): OntologyType | undefined {
    return this.p.ontology.get(name);
  }

  readonly typeOf = (name: string) => this.p.ontology.get(name);

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
    return this.p.graphRepo.upsertEntity(entity);
  }

  /** The developer edits an entity on the Cérebro screen: properties and text (type and id stay). */
  editEntity(id: string, change: { props?: Record<string, unknown>; body?: string }): Entity {
    const current = this.get(id);
    if (!current) throw new Error(`entidade não encontrada: ${id}`);
    return this.upsertEntity({ id, type: current.type, props: change.props ?? current.props, body: change.body ?? current.body });
  }

  /** What deleting an entity takes along: its relations, current and past. */
  entityDependents(id: string): { relations: number } {
    return { relations: this.p.graphRepo.edgeCount(id) };
  }

  deleteEntity(id: string): { relations: number } {
    if (!this.get(id)) throw new Error(`entidade não encontrada: ${id}`);
    let relations = 0;
    transaction(this.p.db, () => {
      relations = this.p.graphRepo.deleteEntity(id);
    });
    return { relations };
  }

  /** Add a fact. Edges are temporal: `validTo` lets "Marina approves until 31/12" expire by itself. */
  addEdge(edge: { from: string; rel: string; to: string; attrs?: Record<string, unknown>; validFrom?: string; validTo?: string | null }): Edge {
    const problems = this.validateEdge(edge);
    if (problems.length) throw new Error(problems.join('; '));
    const row: Edge = { from: edge.from, rel: edge.rel, to: edge.to, attrs: edge.attrs ?? {}, validFrom: edge.validFrom ?? now(), validTo: edge.validTo ?? null };
    this.p.graphRepo.insertEdge(row);
    return row;
  }

  get(id: string): Entity | undefined {
    return this.p.graphRepo.entity(id);
  }

  byType(type: string): Entity[] {
    return this.p.graphRepo.byType(type);
  }

  neighbors(id: string, options: { rel?: string; at?: string } = {}): { out: Edge[]; in: Edge[] } {
    return this.p.graphRepo.neighbors(id, options.at ?? now(), options.rel);
  }

  reachable(id: string, depth = 2): Array<{ id: string; depth: number }> {
    return this.p.graphRepo.reachable(id, depth, now());
  }

  /** Entities for a text, best first (full-text index; see domain/similarity.ts). */
  search(text: string, limit = 10): Entity[] {
    return this.p.graphRepo.search(ftsQuery(text), limit);
  }

  gaps(): Gap[] {
    const at = now();
    return findGaps(this.p.graphRepo.entities(), (id) => this.p.graphRepo.neighbors(id, at).out, this.typeOf);
  }

  graph(): { types: OntologyType[]; entities: Entity[]; edges: Edge[] } {
    return { types: this.types(), entities: this.p.graphRepo.entities(), edges: this.p.graphRepo.edges() };
  }
}
