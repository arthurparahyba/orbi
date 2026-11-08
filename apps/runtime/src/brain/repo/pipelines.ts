import type { DatabaseSync } from 'node:sqlite';
import type { Pipeline, PipelineInputDef } from '../domain/pipelines.ts';
import { json, now, parse, type Row } from './rows.ts';

const toPipeline = (r: Row): Pipeline => ({
  name: String(r.name),
  description: String(r.description),
  inputs: parse(r.inputs, []),
  stages: parse(r.stages, []),
  uses: Number(r.uses),
  updatedAt: String(r.updated_at),
});

/** Esteiras (definitions). Their runs are app state, in pipelines/runs.ts. */
export class PipelineRepo {
  constructor(private readonly db: DatabaseSync) {}

  save(p: PipelineInputDef): void {
    this.db
      .prepare(
        `INSERT INTO pipelines (name, description, inputs, stages, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET description = excluded.description, inputs = excluded.inputs, stages = excluded.stages, updated_at = excluded.updated_at`,
      )
      .run(p.name, p.description ?? '', json(p.inputs ?? []), json(p.stages), now());
  }

  get(name: string): Pipeline | undefined {
    const r = this.db.prepare('SELECT * FROM pipelines WHERE name = ?').get(name) as Row | undefined;
    return r ? toPipeline(r) : undefined;
  }

  all(): Pipeline[] {
    return (this.db.prepare('SELECT * FROM pipelines ORDER BY uses DESC, name').all() as Row[]).map(toPipeline);
  }

  delete(name: string): boolean {
    return Number(this.db.prepare('DELETE FROM pipelines WHERE name = ?').run(name).changes) > 0;
  }

  countUse(name: string): void {
    this.db.prepare('UPDATE pipelines SET uses = uses + 1 WHERE name = ?').run(name);
  }

  /** How many times in a row the developer let each passage go on (stage id → count). */
  passageStreaks(name: string): Record<string, number> {
    const r = this.db.prepare('SELECT passage_streaks FROM pipelines WHERE name = ?').get(name) as Row | undefined;
    return r ? parse(r.passage_streaks, {}) : {};
  }

  setPassageStreaks(name: string, streaks: Record<string, number>): void {
    this.db.prepare('UPDATE pipelines SET passage_streaks = ? WHERE name = ?').run(json(streaks), name);
  }

  /** Esteiras that use a playbook (to warn before deleting it). */
  using(playbook: string): string[] {
    return this.all().filter((p) => p.stages.some((s) => s.options.some((o) => o.playbook === playbook))).map((p) => p.name);
  }
}
