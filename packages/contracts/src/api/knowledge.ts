/**
 * O cérebro: tipos, entidades, ligações, o que falta saber, e a foto do grafo.
 */

export interface OntologyType {
  name: string; description: string; relations: Record<string, string>; requires: string[];
  /** Declared properties (name → what it is) and what is known for every entity of the type (name → how). */
  props?: Record<string, string>; knows?: Record<string, string>;
}

export interface Entity {
  id: string; type: string; props: Record<string, unknown>; body: string; updatedAt: string;
  /** Other names it goes by, and where the fact came from ("cartao:…", "execucao:…"). */
  aliases?: string[]; source?: string;
}

export interface Edge { from: string; rel: string; to: string; attrs: Record<string, unknown>; validFrom: string; validTo: string | null }

export interface Gap { entity: string; type: string; missing: string }

export interface BrainSnapshot {
  stats: { entities: number; edges: number; playbooks: number; openProposals: number; types: number };
  gaps: Gap[]; types: OntologyType[]; entities: Entity[]; edges: Edge[];
}

/** GET /api/brain/entities/:id */
export interface EntityDetail {
  entity: Entity;
  relations: { out: Edge[]; in: Edge[] };
  nearby: Array<{ id: string; depth: number }>;
  /** What deleting it takes along. */
  dependents: { relations: number };
}
