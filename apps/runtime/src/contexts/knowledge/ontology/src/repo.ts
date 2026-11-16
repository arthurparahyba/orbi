import type { DatabaseSync } from 'node:sqlite';
import type { OntologyType } from '../../../../language/index.ts';
import { json, parse, type Row } from '../../../../db/rows.ts';

export class OntologyRepo {
  constructor(private readonly db: DatabaseSync) {}

  upsert(type: OntologyType): void {
    this.db
      .prepare(
        `INSERT INTO types (name, description, relations, requires, props, knows, domain, refresh) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET description = excluded.description,
           relations = excluded.relations, requires = excluded.requires, props = excluded.props,
           knows = excluded.knows, domain = COALESCE(excluded.domain, types.domain),
           refresh = COALESCE(excluded.refresh, types.refresh)`,
      )
      .run(type.name, type.description, json(type.relations), json(type.requires), json(type.props ?? {}), json(type.knows ?? {}), type.domain ?? null, type.refresh ?? null);
  }

  all(): OntologyType[] {
    return (this.db.prepare('SELECT * FROM types ORDER BY name').all() as Row[]).map((r) => ({
      name: String(r.name),
      description: String(r.description),
      relations: parse(r.relations, {}),
      requires: parse(r.requires, []),
      props: parse(r.props, {}),
      knows: parse(r.knows, {}),
      domain: (r.domain as string | null) ?? null,
      refresh: (r.refresh as string | null) ?? null,
    }));
  }

  get(name: string): OntologyType | undefined {
    return this.all().find((t) => t.name === name);
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM types').get() as { n: number }).n);
  }
}
