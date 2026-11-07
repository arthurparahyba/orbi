import type { DatabaseSync } from 'node:sqlite';
import type { Edge, Entity } from '../domain/types.ts';
import { json, now, parse, type Row } from './rows.ts';

const toEntity = (r: Row): Entity => ({
  id: String(r.id),
  type: String(r.type),
  props: parse(r.props, {}),
  body: String(r.body),
  updatedAt: String(r.updated_at),
});

const toEdge = (r: Row): Edge => ({
  from: String(r.from_id),
  rel: String(r.rel),
  to: String(r.to_id),
  attrs: parse(r.attrs, {}),
  validFrom: String(r.valid_from),
  validTo: (r.valid_to as string | null) ?? null,
});

/** Entities and temporal edges. Validation is the caller's (brain/domain). */
export class GraphRepo {
  constructor(private readonly db: DatabaseSync) {}

  upsertEntity(entity: Omit<Entity, 'updatedAt'>): Entity {
    const updatedAt = now();
    this.db
      .prepare(
        `INSERT INTO entities (id, type, props, body, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET type = excluded.type, props = excluded.props,
           body = excluded.body, updated_at = excluded.updated_at`,
      )
      .run(entity.id, entity.type, json(entity.props), entity.body, updatedAt);
    return { ...entity, updatedAt };
  }

  /** Removes an entity and every relation from or to it, in the past too. Returns how many relations went. */
  deleteEntity(id: string): number {
    const edges = Number(this.db.prepare('DELETE FROM edges WHERE from_id = ? OR to_id = ?').run(id, id).changes);
    this.db.prepare('DELETE FROM entities WHERE id = ?').run(id);
    return edges;
  }

  /** Relations from or to an entity, in the past too (what a delete takes along). */
  edgeCount(id: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM edges WHERE from_id = ? OR to_id = ?').get(id, id) as { n: number }).n);
  }

  insertEdge(edge: Edge): void {
    this.db
      .prepare('INSERT OR REPLACE INTO edges (from_id, rel, to_id, attrs, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?)')
      .run(edge.from, edge.rel, edge.to, json(edge.attrs), edge.validFrom, edge.validTo);
  }

  entity(id: string): Entity | undefined {
    const r = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Row | undefined;
    return r ? toEntity(r) : undefined;
  }

  byType(type: string): Entity[] {
    return (this.db.prepare('SELECT * FROM entities WHERE type = ? ORDER BY id').all(type) as Row[]).map(toEntity);
  }

  entities(): Entity[] {
    return (this.db.prepare('SELECT * FROM entities ORDER BY type, id').all() as Row[]).map(toEntity);
  }

  edges(): Edge[] {
    return (this.db.prepare('SELECT * FROM edges ORDER BY valid_from').all() as Row[]).map(toEdge);
  }

  /** Edges valid at `at` touching an entity. */
  neighbors(id: string, at: string, rel?: string): { out: Edge[]; in: Edge[] } {
    const where = `valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)${rel ? ' AND rel = ?' : ''}`;
    const args = rel ? [at, at, rel] : [at, at];
    const out = this.db.prepare(`SELECT * FROM edges WHERE from_id = ? AND ${where}`).all(id, ...args) as Row[];
    const inn = this.db.prepare(`SELECT * FROM edges WHERE to_id = ? AND ${where}`).all(id, ...args) as Row[];
    return { out: out.map(toEdge), in: inn.map(toEdge) };
  }

  /** Every entity reachable from `id` within `depth` hops (recursive CTE, edges valid at `at`). */
  reachable(id: string, depth: number, at: string): Array<{ id: string; depth: number }> {
    return this.db
      .prepare(
        `WITH RECURSIVE walk(id, depth) AS (
           SELECT ?, 0
           UNION
           SELECT CASE WHEN e.from_id = walk.id THEN e.to_id ELSE e.from_id END, walk.depth + 1
           FROM edges e JOIN walk ON (e.from_id = walk.id OR e.to_id = walk.id)
           WHERE walk.depth < ? AND e.valid_from <= ? AND (e.valid_to IS NULL OR e.valid_to >= ?))
         SELECT id, MIN(depth) AS depth FROM walk WHERE id != ? GROUP BY id ORDER BY depth, id`,
      )
      .all(id, depth, at, at, id) as Array<{ id: string; depth: number }>;
  }

  /** Entities whose text contains any of the terms. */
  /** Full-text search over id, type, properties and text: best first (BM25). */
  search(query: string, limit: number): Entity[] {
    if (!query) return [];
    const rows = this.db
      .prepare(
        `SELECT e.* FROM entities_fts f JOIN entities e ON e.id = f.key
         WHERE entities_fts MATCH ? ORDER BY bm25(entities_fts, 0, 6, 3, 2, 1) LIMIT ?`,
      )
      .all(query, limit) as Row[];
    return rows.map(toEntity);
  }

  matching(terms: string[]): Entity[] {
    if (!terms.length) return [];
    const clause = terms.map(() => `LOWER(id || ' ' || type || ' ' || props || ' ' || body) LIKE ?`).join(' OR ');
    return (this.db.prepare(`SELECT * FROM entities WHERE ${clause}`).all(...terms.map((t) => `%${t}%`)) as Row[]).map(toEntity);
  }

  counts(): { entities: number; currentEdges: number } {
    const n = (sql: string) => Number((this.db.prepare(sql).get() as { n: number }).n);
    return {
      entities: n('SELECT COUNT(*) AS n FROM entities'),
      currentEdges: n("SELECT COUNT(*) AS n FROM edges WHERE valid_to IS NULL OR valid_to >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
    };
  }
}
