import type { DatabaseSync } from 'node:sqlite';
import type { Followup, FollowupStatus } from './domain.ts';

type Row = Record<string, unknown>;
const nullable = (v: unknown) => (v === null || v === undefined ? null : String(v));

const toFollowup = (r: Row): Followup => ({
  id: String(r.id),
  conversationId: String(r.conversation_id),
  dueAt: String(r.due_at),
  note: String(r.note),
  status: String(r.status) as FollowupStatus,
  attempts: Number(r.attempts ?? 0),
  runId: nullable(r.run_id),
  stepId: nullable(r.step_id),
  createdAt: String(r.created_at ?? r.due_at),
  deliveredAt: nullable(r.delivered_at),
  cancelledBy: nullable(r.cancelled_by),
  lastError: nullable(r.last_error),
});

/** The followups table (orbi.db). Only followups/service.ts uses it. */
export class FollowupRepo {
  constructor(private readonly db: DatabaseSync) {}

  insert(f: Followup): void {
    this.db
      .prepare('INSERT INTO followups (id, conversation_id, due_at, note, status, attempts, run_id, step_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(f.id, f.conversationId, f.dueAt, f.note, f.status, f.attempts, f.runId ?? null, f.stepId ?? null, f.createdAt);
  }

  save(f: Followup): void {
    this.db
      .prepare('UPDATE followups SET status = ?, attempts = ?, delivered_at = ?, cancelled_by = ?, last_error = ? WHERE id = ?')
      .run(f.status, f.attempts, f.deliveredAt ?? null, f.cancelledBy ?? null, f.lastError ?? null, f.id);
  }

  get(id: string): Followup | undefined {
    const r = this.db.prepare('SELECT * FROM followups WHERE id = ?').get(id) as Row | undefined;
    return r && toFollowup(r);
  }

  /** The one waiting in a conversation (scheduled or being delivered). */
  active(conversationId: string): Followup | undefined {
    const r = this.db.prepare("SELECT * FROM followups WHERE conversation_id = ? AND status IN ('scheduled', 'delivering') ORDER BY due_at LIMIT 1").get(conversationId) as Row | undefined;
    return r && toFollowup(r);
  }

  /** Every active one, soonest first (the Pendências list). */
  allActive(): Followup[] {
    return (this.db.prepare("SELECT * FROM followups WHERE status IN ('scheduled', 'delivering') ORDER BY due_at").all() as Row[]).map(toFollowup);
  }

  /** A conversation's, newest first. */
  inConversation(conversationId: string, limit = 20): Followup[] {
    return (this.db.prepare('SELECT * FROM followups WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?').all(conversationId, limit) as Row[]).map(toFollowup);
  }

  /** Due ones move to delivering; each is claimed once (a second process gets nothing). */
  claimDue(at: string): Followup[] {
    const rows = this.db.prepare("SELECT * FROM followups WHERE status = 'scheduled' AND due_at <= ? ORDER BY due_at").all(at) as Row[];
    const claim = this.db.prepare("UPDATE followups SET status = 'delivering' WHERE id = ? AND status = 'scheduled'");
    return rows.filter((r) => Number(claim.run(String(r.id)).changes) === 1).map((r) => ({ ...toFollowup(r), status: 'delivering' as const }));
  }

  /** Left in delivering when the runtime stopped mid-way: back to scheduled, delivered at the next tick. */
  recoverInterrupted(): number {
    return Number(this.db.prepare("UPDATE followups SET status = 'scheduled' WHERE status = 'delivering'").run().changes);
  }
}
