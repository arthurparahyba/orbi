import type { BrainSnapshot, Edge, Entity, Playbook } from '../../api';

/**
 * The Cérebro screen without the tangle (docs/funcionalidades/18, fase 5): the concepts as the map
 * (tens of nodes, not hundreds), the facts as a list per concept, the graph only around one fact,
 * and the boundary of what the Orbi does alone. No React here: tested with Vitest.
 */

/** A concept on the map, drawn as a node: how many facts it has, whether some lack something, procedures on it. */
export interface ConceptNode { name: string; facts: number; gaps: number; procedures: string[] }

/** The concepts and how they connect: relations declared in the ontology plus the ones facts actually use. */
export function conceptMap(snapshot: BrainSnapshot, playbooks: Playbook[] = []): { nodes: ConceptNode[]; edges: Array<{ from: string; to: string; rel: string }> } {
  const typeOf = new Map(snapshot.entities.map((e) => [e.id, e.type]));
  const nodes = snapshot.types.map((t) => ({
    name: t.name,
    facts: snapshot.entities.filter((e) => e.type === t.name).length,
    gaps: snapshot.gaps.filter((g) => g.type === t.name).length,
    procedures: playbooks.filter((p) => p.appliesTo === t.name || p.inputs?.some((i) => i.concept === t.name)).map((p) => p.name),
  }));
  const seen = new Set<string>();
  const edges: Array<{ from: string; to: string; rel: string }> = [];
  const add = (from: string, rel: string, to: string) => {
    const key = `${from}>${rel}>${to}`;
    if (from === to || seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, rel });
  };
  for (const t of snapshot.types) for (const [rel, to] of Object.entries(t.relations)) if (to !== '*') add(t.name, rel, to);
  for (const e of snapshot.edges.filter((x) => !x.validTo)) {
    const from = typeOf.get(e.from), to = typeOf.get(e.to);
    if (from && to) add(from, e.rel, to);
  }
  return { nodes, edges };
}

/** The map as a snapshot the graph can draw (a concept is a node; its type is its own name, for the color). */
export function mapAsSnapshot(map: ReturnType<typeof conceptMap>): BrainSnapshot {
  const entities: Entity[] = map.nodes.map((n) => ({ id: n.name, type: n.name, props: { nome: `${n.name} (${n.facts})` }, body: '', updatedAt: '' }));
  const edges: Edge[] = map.edges.map((e) => ({ from: e.from, rel: e.rel, to: e.to, attrs: {}, validFrom: '', validTo: null }));
  const gaps = map.nodes.filter((n) => n.gaps > 0).map((n) => ({ entity: n.name, type: n.name, missing: `${n.gaps} lacunas` }));
  return { stats: { entities: entities.length, edges: edges.length, playbooks: 0, openProposals: 0, types: entities.length }, gaps, types: [], entities, edges };
}

/** Only what is around one fact, `depth` relations away (current relations, either direction). */
export function neighborhood(snapshot: BrainSnapshot, id: string, depth = 1): BrainSnapshot {
  const current = snapshot.edges.filter((e) => !e.validTo);
  const keep = new Set([id]);
  for (let d = 0; d < depth; d++) {
    for (const e of current) {
      if (keep.has(e.from)) keep.add(e.to);
      else if (keep.has(e.to)) keep.add(e.from);
    }
  }
  return {
    ...snapshot,
    entities: snapshot.entities.filter((e) => keep.has(e.id)),
    edges: current.filter((e) => keep.has(e.from) && keep.has(e.to)),
    gaps: snapshot.gaps.filter((g) => keep.has(g.entity)),
  };
}

/** Facts of a concept, most recent first, with a filter over the id and the other names. */
export function factsOf(snapshot: BrainSnapshot, concept: string, query = ''): Entity[] {
  const q = query.trim().toLowerCase();
  return snapshot.entities
    .filter((e) => e.type === concept)
    .filter((e) => !q || [e.id, ...(e.aliases ?? [])].some((n) => n.toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

/** What the Orbi does alone and what it still needs the developer for, from the brain itself. */
export interface Frontier { alone: string[]; needs: string[] }

export function frontier(snapshot: BrainSnapshot, playbooks: Playbook[]): Frontier {
  const typeByName = new Map(snapshot.types.map((t) => [t.name, t]));
  const needs: string[] = [];
  const alone: string[] = [];
  for (const pb of playbooks) {
    const missing: string[] = [];
    // {{x.rel[].saber}}: every fact reachable by the relation must have a concept that knows it.
    const text = pb.steps.map((s) => `${s.label} ${s.how}`).join(' ') + pb.instructions;
    for (const m of text.matchAll(/\{\{\s*([a-zA-Z_][\w-]*)\.([\w-]+)\[\]\.([\w-]+)\s*\}\}/g)) {
      const [, input, rel, saber] = m;
      const concept = pb.inputs?.find((i) => i.name === input)?.concept;
      if (!concept) continue;
      const reached = snapshot.edges.filter((e) => !e.validTo && e.rel === rel && snapshot.entities.some((x) => x.id === e.from && x.type === concept));
      const types = new Set(reached.map((e) => snapshot.entities.find((x) => x.id === e.to)?.type).filter((t): t is string => !!t));
      for (const t of types) if (!typeByName.get(t)?.knows?.[saber]) missing.push(`o que é "${saber}" para ${t}`);
    }
    if (missing.length) needs.push(`${pb.name}: ${[...new Set(missing)].join(', ')}`);
    else if (pb.inputs?.length) alone.push(pb.name);
  }
  for (const t of snapshot.types) {
    if (!snapshot.entities.some((e) => e.type === t.name) && playbooks.some((p) => p.inputs?.some((i) => i.concept === t.name))) {
      needs.push(`nenhum ${t.name} conhecido ainda: o primeiro pedido vai investigar`);
    }
  }
  for (const g of snapshot.gaps) needs.push(`${g.entity} não tem ${g.missing}`);
  return { alone, needs };
}
