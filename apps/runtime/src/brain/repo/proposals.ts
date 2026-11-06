import type { DatabaseSync } from 'node:sqlite';
import type { Proposal, ProposalKind } from '../domain/types.ts';
import { json, parse, type Row } from './rows.ts';

/** Learning that waits for the developer's approval. */
export class ProposalRepo {
  constructor(private readonly db: DatabaseSync) {}

  insert(p: Proposal): void {
    this.db
      .prepare('INSERT INTO proposals (id, kind, payload, reason, conversation_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, p.kind, json(p.payload), p.reason, p.conversationId, p.status, p.createdAt);
  }

  list(status: Proposal['status']): Proposal[] {
    return (this.db.prepare('SELECT * FROM proposals WHERE status = ? ORDER BY created_at').all(status) as Row[]).map((r) => ({
      id: String(r.id),
      kind: String(r.kind) as ProposalKind,
      payload: parse(r.payload, {}),
      reason: String(r.reason),
      conversationId: String(r.conversation_id),
      status: String(r.status) as Proposal['status'],
      createdAt: String(r.created_at),
    }));
  }

  get(id: string): Proposal | undefined {
    return this.list('open').find((p) => p.id === id);
  }

  setStatus(id: string, status: Proposal['status']): void {
    this.db.prepare("UPDATE proposals SET status = ? WHERE id = ? AND status = 'open'").run(status, id);
  }

  countOpen(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE status = 'open'").get() as { n: number }).n);
  }
}
