import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import { now, type Row } from './rows.ts';
import type { ReviewNote, ReviewNoteKind, ReviewNoteStatus } from '../domain/judge.ts';

const toNote = (r: Row): ReviewNote => ({
  id: String(r.id),
  playbook: String(r.playbook),
  kind: String(r.kind) as ReviewNoteKind,
  subject: String(r.subject),
  text: String(r.text),
  runId: (r.run_id as string | null) ?? null,
  conversationId: String(r.conversation_id),
  status: String(r.status) as ReviewNoteStatus,
  times: Number(r.times),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

/** What the end-of-run review kept for later: ideas, environments to fix, the scope of a change. */
export class ReviewNoteRepo {
  constructor(private readonly db: DatabaseSync) {}

  insert(n: Omit<ReviewNote, 'id' | 'times' | 'createdAt' | 'updatedAt'>): ReviewNote {
    const at = now();
    const id = ulid();
    this.db
      .prepare('INSERT INTO review_notes (id, playbook, kind, subject, text, run_id, conversation_id, status, times, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .run(id, n.playbook, n.kind, n.subject, n.text, n.runId, n.conversationId, n.status, at, at);
    return this.get(id)!;
  }

  get(id: string): ReviewNote | undefined {
    const r = this.db.prepare('SELECT * FROM review_notes WHERE id = ?').get(id) as Row | undefined;
    return r ? toNote(r) : undefined;
  }

  /** The latest note of a kind about the same thing (an analyzer, a problem) for a procedure. */
  latest(playbook: string, kind: ReviewNoteKind, subject: string): ReviewNote | undefined {
    const r = this.db.prepare('SELECT * FROM review_notes WHERE playbook = ? AND kind = ? AND subject = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(playbook, kind, subject) as Row | undefined;
    return r ? toNote(r) : undefined;
  }

  /** Seen again: one more time, with the latest run and text. */
  again(id: string, text: string, runId: string | null): ReviewNote {
    this.db.prepare('UPDATE review_notes SET times = times + 1, text = ?, run_id = ?, updated_at = ? WHERE id = ?').run(text, runId, now(), id);
    return this.get(id)!;
  }

  setStatus(id: string, status: ReviewNoteStatus): ReviewNote | undefined {
    this.db.prepare('UPDATE review_notes SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
    return this.get(id);
  }

  list(filter: { playbook?: string; kind?: ReviewNoteKind; status?: ReviewNoteStatus } = {}): ReviewNote[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.playbook) { where.push('playbook = ?'); args.push(filter.playbook); }
    if (filter.kind) { where.push('kind = ?'); args.push(filter.kind); }
    if (filter.status) { where.push('status = ?'); args.push(filter.status); }
    const sql = `SELECT * FROM review_notes${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC, id DESC`;
    return (this.db.prepare(sql).all(...args) as Row[]).map(toNote);
  }
}
