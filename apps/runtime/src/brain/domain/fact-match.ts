import type { Entity } from './types.ts';

/**
 * A fact someone proposes against what the brain already has (docs/funcionalidades/22), pure:
 * the same thing under another name is not a new fact, the same value is not news, and learning
 * adds to a fact instead of replacing it (properties and other names that were there stay).
 */
export type Candidate = { id: string; type: string; props: Record<string, unknown>; aliases?: string[]; body?: string };

export type FactVerdict =
  /** Nothing new: already in the brain as proposed. */
  | { kind: 'known'; id: string }
  /** The fact exists (same id): what it adds and what it changes. */
  | { kind: 'update'; id: string; adds: Record<string, unknown>; changes: Array<{ prop: string; from: unknown; to: unknown }>; aliases: string[] }
  /** Another fact of the same concept is this one (its name, another name, or the same value). */
  | { kind: 'same'; id: string; as: string; why: string; adds: Record<string, unknown>; changes: Array<{ prop: string; from: unknown; to: unknown }>; aliases: string[] }
  | { kind: 'new' };

/** Without accents, case or punctuation: "Pagamentos_API" and "pagamentos-api" are the same name. */
export const compact = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What `cand` adds to and changes in `existing`, and the other names it brings. */
function diff(existing: Entity, cand: Candidate) {
  const adds: Record<string, unknown> = {};
  const changes: Array<{ prop: string; from: unknown; to: unknown }> = [];
  for (const [k, v] of Object.entries(cand.props)) {
    if (!(k in existing.props)) adds[k] = v;
    else if (!same(existing.props[k], v)) changes.push({ prop: k, from: existing.props[k], to: v });
  }
  const known = new Set([existing.id, ...(existing.aliases ?? [])].map(compact));
  const aliases = [...(cand.id !== existing.id ? [cand.id] : []), ...(cand.aliases ?? [])].filter((a) => !known.has(compact(a)));
  return { adds, changes, aliases: [...new Set(aliases)] };
}

export function classifyEntity(cand: Candidate, byType: (type: string) => Entity[]): FactVerdict {
  const all = byType(cand.type);
  const verdict = (existing: Entity, why?: string): FactVerdict => {
    const d = diff(existing, cand);
    if (!Object.keys(d.adds).length && !d.changes.length && !d.aliases.length) return { kind: 'known', id: existing.id };
    return existing.id === cand.id ? { kind: 'update', id: existing.id, ...d } : { kind: 'same', id: existing.id, as: cand.id, why: why ?? '', ...d };
  };
  const exact = all.find((e) => e.id === cand.id);
  if (exact) return verdict(exact);
  // Its name, or one of its other names, is the name of a fact we have.
  const names = [cand.id, ...(cand.aliases ?? [])].map(compact);
  const byName = all.find((e) => [e.id, ...(e.aliases ?? [])].some((n) => names.includes(compact(n))));
  if (byName) return verdict(byName, `o nome "${cand.id}" é de ${byName.id}`);
  // The same identifying value (a repository, an address) under the same property.
  for (const [k, v] of Object.entries(cand.props)) {
    if (typeof v !== 'string' || v.trim().length < 4) continue;
    const byValue = all.find((e) => typeof e.props[k] === 'string' && compact(String(e.props[k])) === compact(v));
    if (byValue) return verdict(byValue, `${k} = ${v} já é de ${byValue.id}`);
  }
  return { kind: 'new' };
}

/** Learning adds: properties summed (the new values win), other names joined, text kept if none comes. */
export function mergeEntity(existing: Entity | undefined, next: Omit<Entity, 'updatedAt'>): Omit<Entity, 'updatedAt'> {
  if (!existing) return next;
  const aliases = [...new Set([...(existing.aliases ?? []), ...(next.aliases ?? [])])].filter((a) => compact(a) !== compact(next.id));
  return { ...next, props: { ...existing.props, ...next.props }, body: next.body?.trim() ? next.body : existing.body, aliases, source: next.source || existing.source };
}

/** One line for the card and the instruction: what happens to this fact. */
export function verdictLine(cand: Candidate, v: FactVerdict): string {
  const show = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));
  const parts = (d: { adds: Record<string, unknown>; changes: Array<{ prop: string; from: unknown; to: unknown }>; aliases: string[] }) => [
    ...Object.entries(d.adds).map(([k, x]) => `acrescenta ${k} = ${show(x)}`),
    ...d.changes.map((c) => `muda ${c.prop}: ${show(c.from)} → ${show(c.to)}`),
    ...(d.aliases.length ? [`outro nome: ${d.aliases.join(', ')}`] : []),
  ].join('; ');
  if (v.kind === 'known') return `${v.id}: já sei`;
  if (v.kind === 'update') return `${v.id}: ${parts(v)}`;
  if (v.kind === 'same') return `${v.as} é o mesmo que ${v.id} (${v.why}): ${parts(v)}`;
  return `${cand.id} (${cand.type}): novo`;
}
