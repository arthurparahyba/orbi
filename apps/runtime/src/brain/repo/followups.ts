import type { DatabaseSync } from 'node:sqlite';
import type { Row } from './rows.ts';

export interface DueFollowup {
  id: string;
  conversationId: string;
  note: string;
  dueAt: string;
}

/** Orbi waking itself up later in a conversation. */
export class FollowupRepo {
  constructor(private readonly db: DatabaseSync) {}

  schedule(id: string, conversationId: string, dueAt: string, note: string): void {
    this.db.prepare('INSERT INTO followups (id, conversation_id, due_at, note) VALUES (?, ?, ?, ?)').run(id, conversationId, dueAt, note);
  }

  /** Follow-ups due at `at`; each is claimed (returned) once. */
  claimDue(at: string): DueFollowup[] {
    const rows = this.db.prepare("SELECT * FROM followups WHERE status = 'scheduled' AND due_at <= ? ORDER BY due_at").all(at) as Row[];
    const claim = this.db.prepare("UPDATE followups SET status = 'fired' WHERE id = ? AND status = 'scheduled'");
    return rows
      .filter((r) => Number(claim.run(String(r.id)).changes) === 1)
      .map((r) => ({ id: String(r.id), conversationId: String(r.conversation_id), note: String(r.note), dueAt: String(r.due_at) }));
  }
}
