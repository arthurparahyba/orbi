import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import { now, type Row } from './rows.ts';
import { sameAttempt, type LearningOutcome, type LearningSource, type NewLearning, type StepLearning } from '../domain/step-learnings.ts';

const toLearning = (r: Row): StepLearning => ({
  id: String(r.id),
  playbook: String(r.playbook),
  step: (r.step as string | null) ?? null,
  tried: String(r.tried),
  outcome: String(r.outcome) as LearningOutcome,
  why: String(r.why),
  source: String(r.source) as LearningSource,
  runId: (r.run_id as string | null) ?? null,
  conversationId: String(r.conversation_id),
  times: Number(r.times),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

/** What was already tried in each procedure (docs/funcionalidades/25). */
export class StepLearningRepo {
  constructor(private readonly db: DatabaseSync) {}

  list(playbook: string): StepLearning[] {
    return (this.db.prepare('SELECT * FROM playbook_learnings WHERE playbook = ? ORDER BY updated_at DESC, id DESC').all(playbook) as Row[]).map(toLearning);
  }

  /** The same attempt with the same outcome is counted, not repeated. */
  add(n: NewLearning): StepLearning {
    const at = now();
    const same = this.list(n.playbook).find((l) => l.step === n.step && l.outcome === n.outcome && sameAttempt(l.tried, n.tried));
    if (same) {
      this.db.prepare('UPDATE playbook_learnings SET times = times + 1, why = ?, run_id = ?, updated_at = ? WHERE id = ?').run(n.why || same.why, n.runId ?? same.runId, at, same.id);
      return this.get(same.id)!;
    }
    const id = ulid();
    this.db
      .prepare('INSERT INTO playbook_learnings (id, playbook, step, tried, outcome, why, source, run_id, conversation_id, times, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .run(id, n.playbook, n.step, n.tried, n.outcome, n.why, n.source, n.runId, n.conversationId, at, at);
    return this.get(id)!;
  }

  get(id: string): StepLearning | undefined {
    const r = this.db.prepare('SELECT * FROM playbook_learnings WHERE id = ?').get(id) as Row | undefined;
    return r ? toLearning(r) : undefined;
  }

  remove(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM playbook_learnings WHERE id = ?').run(id).changes) > 0;
  }

  forget(playbook: string): void {
    this.db.prepare('DELETE FROM playbook_learnings WHERE playbook = ?').run(playbook);
  }
}
