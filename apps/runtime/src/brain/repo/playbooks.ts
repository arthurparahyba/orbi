import type { DatabaseSync } from 'node:sqlite';
import type { Autonomy, Playbook, PlaybookInput, PlaybookRun } from '../domain/types.ts';
import type { Deviation, Level, LevelState, RunAction } from '../domain/levels.ts';
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
  outputs: parse(r.outputs, []),
  level: Number(r.level ?? 1) as Level,
  levelMax: Number(r.level_max ?? 3) as Level,
  levelBy: String(r.level_by ?? 'learned') as Playbook['levelBy'],
  cleanStreak: Number(r.clean_streak ?? 0),
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
  params: parse(r.params, {}),
  outputs: parse(r.outputs, {}),
  actions: parse(r.actions, []),
  deviations: parse(r.deviations, []),
  startedAt: String(r.started_at),
  finishedAt: nullable(r.finished_at),
});

/** Playbooks and their runs. Uses/successes counters are kept on save. */
export class PlaybookRepo {
  constructor(private readonly db: DatabaseSync) {}

  save(pb: PlaybookInput): void {
    this.db
      .prepare(
        `INSERT INTO playbooks (name, description, applies_to, trigger, autonomy, steps, instructions, learned_from, variation_of, outputs, uses, successes, updated_at, level, level_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET description = excluded.description, applies_to = excluded.applies_to,
           trigger = excluded.trigger, autonomy = excluded.autonomy, steps = excluded.steps,
           instructions = excluded.instructions, learned_from = excluded.learned_from,
           variation_of = excluded.variation_of, outputs = excluded.outputs, updated_at = excluded.updated_at`,
      )
      // A new playbook marked "auto" was trusted by whoever made it: it starts at N3, set by the developer.
      .run(pb.name, pb.description, pb.appliesTo, pb.trigger, pb.autonomy, json(pb.steps), pb.instructions, pb.learnedFrom, pb.variationOf ?? null, json(pb.outputs ?? []), now(),
        pb.autonomy === 'auto' ? 3 : 1, pb.autonomy === 'auto' ? 'user' : 'learned');
  }

  /** Removes a playbook. Its variations stay, no longer linked; its runs stay as history. Returns the variations detached. */
  delete(name: string): string[] {
    const variations = (this.db.prepare('SELECT name FROM playbooks WHERE variation_of = ? ORDER BY name').all(name) as Row[]).map((r) => String(r.name));
    this.db.prepare('UPDATE playbooks SET variation_of = NULL WHERE variation_of = ?').run(name);
    this.db.prepare('DELETE FROM playbooks WHERE name = ?').run(name);
    return variations;
  }

  setAutonomy(name: string, autonomy: Autonomy): void {
    this.db.prepare('UPDATE playbooks SET autonomy = ?, updated_at = ? WHERE name = ?').run(autonomy, now(), name);
  }

  /** Level, ceiling, who set it and the clean-run streak; `autonomy` follows (auto at N3, else ask; observe stays). */
  setLevel(name: string, state: LevelState): void {
    this.db
      .prepare(
        `UPDATE playbooks SET level = ?, level_max = ?, level_by = ?, clean_streak = ?,
           autonomy = CASE WHEN autonomy = 'observe' THEN 'observe' WHEN ? = 3 THEN 'auto' ELSE 'ask' END WHERE name = ?`,
      )
      .run(state.level, state.levelMax, state.levelBy, state.cleanStreak, state.level, name);
  }

  markReviewed(id: string): void {
    this.db.prepare('UPDATE playbook_runs SET reviewed_at = ? WHERE id = ?').run(now(), id);
  }

  /** Runs of a conversation that ended and were not reviewed yet, oldest first. */
  unreviewedIn(conversationId: string): PlaybookRun[] {
    return (
      this.db
        .prepare("SELECT * FROM playbook_runs WHERE conversation_id = ? AND status IN ('done', 'failed') AND reviewed_at IS NULL ORDER BY started_at, id")
        .all(conversationId) as Row[]
    ).map(toRun);
  }

  /** Runs of a conversation still open (a step never closed) and not reviewed. */
  openUnreviewedIn(conversationId: string): PlaybookRun[] {
    return (
      this.db
        .prepare("SELECT * FROM playbook_runs WHERE conversation_id = ? AND status IN ('running', 'waiting') AND reviewed_at IS NULL ORDER BY started_at, id")
        .all(conversationId) as Row[]
    ).map(toRun);
  }

  setRunTrail(id: string, actions: RunAction[], deviations: Deviation[]): void {
    this.db.prepare('UPDATE playbook_runs SET actions = ?, deviations = ? WHERE id = ?').run(json(actions), json(deviations), id);
  }

  /** Full-text search (see brain/domain/similarity.ts): best first, by BM25 with the name weighing most. */
  search(query: string, limit: number): Playbook[] {
    if (!query) return [];
    const rows = this.db
      .prepare(
        `SELECT p.* FROM playbooks_fts f JOIN playbooks p ON p.name = f.key
         WHERE playbooks_fts MATCH ? ORDER BY bm25(playbooks_fts, 0, 8, 4, 4, 2, 1), p.successes DESC LIMIT ?`,
      )
      .all(query, limit) as Row[];
    return rows.map(toPlaybook);
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
      .prepare('INSERT INTO playbook_runs (id, playbook, conversation_id, status, steps, params, outputs, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(run.id, run.playbook, run.conversationId, run.status, json(run.steps), json(run.params), json(run.outputs), run.startedAt);
  }

  updateRun(run: PlaybookRun): void {
    this.db.prepare('UPDATE playbook_runs SET steps = ?, status = ?, outputs = ?, finished_at = ? WHERE id = ?').run(json(run.steps), run.status, json(run.outputs), run.finishedAt, run.id);
  }

  run(id: string): PlaybookRun | undefined {
    const r = this.db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : undefined;
  }

  runs(limit: number): PlaybookRun[] {
    return (this.db.prepare('SELECT * FROM playbook_runs ORDER BY started_at DESC LIMIT ?').all(limit) as Row[]).map(toRun);
  }

  /** The latest run started in a conversation. */
  lastRunIn(conversationId: string): PlaybookRun | undefined {
    const r = this.db.prepare('SELECT * FROM playbook_runs WHERE conversation_id = ? ORDER BY started_at DESC, id DESC LIMIT 1').get(conversationId) as Row | undefined;
    return r ? toRun(r) : undefined;
  }
}
