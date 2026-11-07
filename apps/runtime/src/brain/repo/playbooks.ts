import type { DatabaseSync } from 'node:sqlite';
import type { Autonomy, Playbook, PlaybookRun } from '../domain/types.ts';
import { json, now, nullable, parse, type Row } from './rows.ts';

const toPlaybook = (r: Row): Playbook => ({
  name: String(r.name),
  description: String(r.description),
  appliesTo: nullable(r.applies_to),
  trigger: String(r.trigger),
  autonomy: String(r.autonomy) as Autonomy,
  steps: parse(r.steps, []),
  instructions: String(r.instructions),
  learnedFrom: nullable(r.learned_from),
  variationOf: nullable(r.variation_of),
  uses: Number(r.uses),
  successes: Number(r.successes),
  updatedAt: String(r.updated_at),
});

const toRun = (r: Row): PlaybookRun => ({
  id: String(r.id),
  playbook: String(r.playbook),
  conversationId: String(r.conversation_id),
  status: String(r.status) as PlaybookRun['status'],
  steps: parse(r.steps, []),
  startedAt: String(r.started_at),
  finishedAt: nullable(r.finished_at),
});

/** Playbooks and their runs. Uses/successes counters are kept on save. */
export class PlaybookRepo {
  constructor(private readonly db: DatabaseSync) {}

  save(pb: Omit<Playbook, 'uses' | 'successes' | 'updatedAt'>): void {
    this.db
      .prepare(
        `INSERT INTO playbooks (name, description, applies_to, trigger, autonomy, steps, instructions, learned_from, variation_of, uses, successes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
         ON CONFLICT(name) DO UPDATE SET description = excluded.description, applies_to = excluded.applies_to,
           trigger = excluded.trigger, autonomy = excluded.autonomy, steps = excluded.steps,
           instructions = excluded.instructions, learned_from = excluded.learned_from,
           variation_of = excluded.variation_of, updated_at = excluded.updated_at`,
      )
      .run(pb.name, pb.description, pb.appliesTo, pb.trigger, pb.autonomy, json(pb.steps), pb.instructions, pb.learnedFrom, pb.variationOf ?? null, now());
  }

  setAutonomy(name: string, autonomy: Autonomy): void {
    this.db.prepare('UPDATE playbooks SET autonomy = ?, updated_at = ? WHERE name = ?').run(autonomy, now(), name);
  }

  get(name: string): Playbook | undefined {
    const r = this.db.prepare('SELECT * FROM playbooks WHERE name = ?').get(name) as Row | undefined;
    return r ? toPlaybook(r) : undefined;
  }

  all(): Playbook[] {
    return (this.db.prepare('SELECT * FROM playbooks ORDER BY name').all() as Row[]).map(toPlaybook);
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM playbooks').get() as { n: number }).n);
  }

  countUse(name: string): void {
    this.db.prepare('UPDATE playbooks SET uses = uses + 1 WHERE name = ?').run(name);
  }

  countSuccess(name: string): void {
    this.db.prepare('UPDATE playbooks SET successes = successes + 1 WHERE name = ?').run(name);
  }

  insertRun(run: PlaybookRun): void {
    this.db
      .prepare('INSERT INTO playbook_runs (id, playbook, conversation_id, status, steps, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(run.id, run.playbook, run.conversationId, run.status, json(run.steps), run.startedAt);
  }

  updateRun(run: PlaybookRun): void {
    this.db.prepare('UPDATE playbook_runs SET steps = ?, status = ?, finished_at = ? WHERE id = ?').run(json(run.steps), run.status, run.finishedAt, run.id);
  }

  run(id: string): PlaybookRun | undefined {
    const r = this.db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : undefined;
  }

  runs(limit: number): PlaybookRun[] {
    return (this.db.prepare('SELECT * FROM playbook_runs ORDER BY started_at DESC LIMIT ?').all(limit) as Row[]).map(toRun);
  }
}
