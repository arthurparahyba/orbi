import type { Edge, Entity, Gap, OntologyType } from './types.ts';

/** Ontology rules: which entities and relations are valid, and what is missing. No storage here. */

/** Base ontology the brain starts with. Everything else is learned. */
export const SEED_TYPES: OntologyType[] = [
  { name: 'Classe', description: 'Categoria de coisas (ex.: FrontEnd, ServicoJava). Playbooks se prendem a classes.', relations: {}, requires: [] },
  { name: 'Repositorio', description: 'Repositório de código.', relations: { eUm: 'Classe', publicaEm: 'Ambiente', registradoEm: 'Portal', temWorkflow: 'Workflow', teve: 'Incidente', dono: 'Pessoa' }, requires: [] },
  { name: 'Workflow', description: 'Pipeline de CI/CD (ex.: GitHub Actions).', relations: { publicaEm: 'Ambiente', gera: '*' }, requires: [] },
  { name: 'Ambiente', description: 'Onde o software roda (dev, homologação…).', relations: { dispara: 'Playbook', logsEm: 'Ferramenta' }, requires: [] },
  { name: 'Ferramenta', description: 'CLI, MCP ou sistema que o Orbi sabe usar.', relations: { exige: 'Ferramenta' }, requires: [] },
  { name: 'Portal', description: 'Sistema web operado pelo navegador.', relations: {}, requires: [] },
  { name: 'Playbook', description: 'Procedimento aprendido que o Orbi executa.', relations: { aplicaA: '*', usa: '*', resolve: 'Incidente' }, requires: [] },
  { name: 'Incidente', description: 'Algo que deu errado e como foi resolvido.', relations: { resolvidoPor: 'Playbook', semelhanteA: 'Incidente', ocorreuEm: '*' }, requires: [] },
  { name: 'Mudanca', description: 'Mudança registrada (ex.: GMUD no ServiceNow).', relations: { entrega: 'Historia', aprovadaPor: 'Pessoa', referente: 'Repositorio' }, requires: [] },
  { name: 'Historia', description: 'Item do board entregue por uma release.', relations: {}, requires: [] },
  { name: 'Pessoa', description: 'Quem decide ou aprova algo.', relations: { substitutaDe: 'Pessoa' }, requires: [] },
];

const ENTITY_ID = /^[\p{L}\p{N}][\p{L}\p{N}._:/-]*$/u;
const TYPE_NAME = /^[A-Z][A-Za-z]+$/;

export const isTypeName = (name: unknown): name is string => typeof name === 'string' && TYPE_NAME.test(name);

/** Problems with an entity against the known types; empty = valid. */
export function entityProblems(entity: Pick<Entity, 'id' | 'type'>, typeOf: (name: string) => OntologyType | undefined): string[] {
  const problems: string[] = [];
  if (!ENTITY_ID.test(entity.id)) problems.push(`id inválido: "${entity.id}"`);
  if (!typeOf(entity.type)) problems.push(`tipo desconhecido: ${entity.type}`);
  return problems;
}

/** Problems with a relation between two existing entities; empty = valid. */
export function edgeProblems(
  edge: Pick<Edge, 'from' | 'rel' | 'to'>,
  from: Entity | undefined,
  to: Entity | undefined,
  typeOf: (name: string) => OntologyType | undefined,
): string[] {
  if (!from) return [`origem não existe: ${edge.from}`];
  if (!to) return [`destino não existe: ${edge.to}`];
  const allowed = typeOf(from.type)?.relations[edge.rel];
  if (!allowed) return [`ligação "${edge.rel}" não existe para ${from.type}`];
  if (allowed !== '*' && allowed !== to.type) return [`"${edge.rel}" de ${from.type} aponta para ${allowed}, não ${to.type}`];
  return [];
}

/**
 * Gap rules: relations an entity should have but lacks — required by its type,
 * or by a class it belongs to (`eUm`, with the class's `props.requires`).
 */
export function findGaps(
  entities: Entity[],
  outEdges: (id: string) => Edge[],
  typeOf: (name: string) => OntologyType | undefined,
): Gap[] {
  const classRequires = new Map<string, string[]>();
  for (const cls of entities.filter((e) => e.type === 'Classe')) {
    const req = cls.props.requires;
    if (Array.isArray(req)) classRequires.set(cls.id, req.map(String));
  }
  const gaps: Gap[] = [];
  for (const entity of entities) {
    const out = outEdges(entity.id);
    const required = new Set(typeOf(entity.type)?.requires ?? []);
    for (const edge of out.filter((e) => e.rel === 'eUm')) {
      for (const r of classRequires.get(edge.to) ?? []) required.add(r);
    }
    for (const rel of required) {
      if (!out.some((e) => e.rel === rel)) gaps.push({ entity: entity.id, type: entity.type, missing: rel });
    }
  }
  return gaps;
}

/** Ranks search hits by how many terms each matches. */
export function rankByTerms<T>(items: T[], text: string, limit: number): T[] {
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .map((item) => ({ item, score: terms.filter((t) => JSON.stringify(item).toLowerCase().includes(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
