import type { Edge, Entity, OntologyType } from '../../../../language/index.ts';
import { ftsQuery } from '../../search/src/similarity.ts';
import type { OntologyRepo } from '../../ontology/src/repo.ts';
import type { GraphRepo } from './repo.ts';
import type { DomainRepo } from '../../domains/src/repo.ts';

/**
 * What a run needs from `knowledge`, and nothing more. Step 0 of a procedure turns an input into
 * a fact of a concept that already exists, with its origin and an undo (documento 22), so a
 * running procedure writes here — this port is that permission, named and bounded, so the
 * `procedures` context never holds this context's repositories (documento 26).
 */
export interface FactsForRun {
  typeOf(name: string): OntologyType | undefined;
  entity(id: string): Entity | undefined;
  /**
   * Fato daquele conceito com aquele nome. Com `domain`, só dentro do alcance daquele domínio
   * (documento 28, fase B): é o que impede o passo 0 de resolver em silêncio para um fato de
   * outro assunto que por acaso se chama igual.
   */
  named(type: string, name: string, domain?: string | null): Entity[];
  out(id: string, at: string): Edge[];
  search(text: string, limit?: number): Entity[];
  /** Step 0 only: what the input turned out to be, as it is (no merge, no card). */
  save(entity: Omit<Entity, 'updatedAt'>): void;
  link(edge: Edge): void;
  /** Desfazer: drops what step 0 created. */
  remove(id: string): void;
}

/** The implementation this context hands to whoever runs procedures. */
export const factsForRun = (ontology: OntologyRepo, graph: GraphRepo, domains: DomainRepo): FactsForRun => ({
  typeOf: (name) => ontology.get(name),
  entity: (id) => graph.entity(id),
  named: (type, name, domain) => (domain === undefined ? graph.named(type, name) : graph.namedIn(type, name, domains.reach(domain))),
  out: (id, at) => graph.neighbors(id, at).out,
  // The caller passes plain text: turning it into an FTS query is this context's business.
  search: (text, limit = 10) => graph.search(ftsQuery(text), limit),
  save: (entity) => void graph.upsertEntity(entity),
  link: (edge) => graph.insertEdge(edge),
  remove: (id) => void graph.deleteEntity(id),
});
