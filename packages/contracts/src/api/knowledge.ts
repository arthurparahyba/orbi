/**
 * O cérebro: tipos, entidades, ligações, o que falta saber, e a foto do grafo.
 */

export interface OntologyType {
  name: string; description: string; relations: Record<string, string>; requires: string[];
  /** Declared properties (name → what it is) and what is known for every entity of the type (name → how). */
  props?: Record<string, string>; knows?: Record<string, string>;
  /** O assunto a que o tipo pertence (documento 28). Nulo é `comum`. */
  domain?: string | null;
}

export interface Entity {
  id: string; type: string; props: Record<string, unknown>; body: string; updatedAt: string;
  /** Other names it goes by, and where the fact came from ("cartao:…", "execucao:…"). */
  aliases?: string[]; source?: string;
  /** O assunto em que foi aprendido (documento 28). Nulo é `comum`: vale em todo domínio. */
  domain?: string | null;
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

/** Um assunto do cérebro (documento 28). O nome vazio é `comum`, a camada de base. */
export interface Domain {
  name: string;
  description: string;
  /** O playbook ou a conversa que deu nome a ele. */
  bornFrom: string | null;
  createdAt: string;
}

export interface DomainSize extends Domain {
  entities: number;
  types: number;
  playbooks: number;
}

/** Um fato de um domínio ligado a um fato de outro. Relação com `comum` não é ponte. */
export interface Bridge {
  from: string; fromDomain: string; rel: string; to: string; toDomain: string;
}

/** GET /api/brain/domains */
export interface DomainOverview {
  domains: DomainSize[];
  /** Por par de domínios: quantos fatos um empresta ao outro. */
  lends: Array<{ from: string; to: string; facts: number }>;
  /** Fato comum cujo tipo é de um domínio: pela regra 1 deveria ser do domínio do tipo. */
  mismatched: Array<{ id: string; type: string; typeDomain: string }>;
}

/** GET /api/brain/domains/:name — o nome vazio (`-`) é `comum`. */
export interface DomainDetail {
  domain: Domain;
  types: string[];
  facts: Entity[];
  playbooks: Array<{ name: string; level: 1 | 2 | 3; uses: number }>;
  bridges: Bridge[];
}
