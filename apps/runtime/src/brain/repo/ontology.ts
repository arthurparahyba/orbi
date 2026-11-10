import type { DatabaseSync } from 'node:sqlite';
import type { OntologyType } from '../domain/types.ts';
import { json, parse, type Row } from './rows.ts';

export class OntologyRepo {
  constructor(private readonly db: DatabaseSync) {}

  upsert(type: OntologyType): void {
    this.db
      .prepare(
        `INSERT INTO types (name, description, relations, requires, props, knows) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET description = excluded.description,
           relations = excluded.relations, requires = excluded.requires, props = excluded.props, knows = excluded.knows`,
      )
      .run(type.name, type.description, json(type.relations), json(type.requires), json(type.props ?? {}), json(type.knows ?? {}));
  }

  all(): OntologyType[] {
    return (this.db.prepare('SELECT * FROM types ORDER BY name').all() as Row[]).map((r) => ({
      name: String(r.name),
      description: String(r.description),
      relations: parse(r.relations, {}),
      requires: parse(r.requires, []),
      props: parse(r.props, {}),
      knows: parse(r.knows, {}),
    }));
  }

  get(name: string): OntologyType | undefined {
    return this.all().find((t) => t.name === name);
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM types').get() as { n: number }).n);
  }
}
