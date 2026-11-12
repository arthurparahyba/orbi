import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';

/**
 * What the "Pendências" panel shows: approvals waiting for a decision,
 * learning to approve, questions Orbi asked and credentials it needs. Decisions go back into the
 * agent conversation as signals (see http/app.ts).
 */
/** `level`: only informs (a level or passage changed); it waits for nothing. */
export type InboxKind = 'approval' | 'question' | 'learning' | 'secret' | 'pipeline' | 'level' | 'code-change' | 'followup';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  /** Agent conversation that raised it, e.g. `chat:01…`. */
  conversationId: string;
  title: string;
  detail: string;
  /** For approvals: the gated tool call id. For level notes: the value before the change. */
  approvalId?: string;
  routine?: string;
  createdAt: string;
  status: 'open' | 'approved' | 'denied' | 'answered';
  /** For answered questions: what the developer answered (cards show the choice). */
  answer?: string;
  /** Changed in the card's conversation: the version shown now and the earlier ones (docs/funcionalidades/21). */
  version?: number;
  versions?: Array<{ title: string; detail: string; at: string }>;
}

type Row = Record<string, unknown>;
const toItem = (r: Row): InboxItem => ({
  id: String(r.id),
  kind: String(r.kind) as InboxKind,
  conversationId: String(r.conversation_id),
  title: String(r.title),
  detail: String(r.detail),
  ...(r.approval_id ? { approvalId: String(r.approval_id) } : {}),
  ...(r.routine ? { routine: String(r.routine) } : {}),
  createdAt: String(r.created_at),
  status: String(r.status) as InboxItem['status'],
  ...(r.answer ? { answer: String(r.answer) } : {}),
  ...(Number(r.version) > 1 ? { version: Number(r.version), versions: JSON.parse(String(r.versions ?? '[]')) } : {}),
});

export class Inbox {
  constructor(private readonly db: DatabaseSync) {}

  add(item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>): InboxItem {
    const created: InboxItem = { ...item, id: ulid(), createdAt: new Date().toISOString(), status: 'open' };
    this.insert(created);
    return created;
  }

  /** Inserts an item as is (used to import the old inbox.json). */
  insert(item: InboxItem): void {
    this.db
      .prepare('INSERT OR IGNORE INTO inbox_items (id, kind, conversation_id, title, detail, approval_id, routine, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, item.kind, item.conversationId, item.title, item.detail, item.approvalId ?? null, item.routine ?? null, item.status, item.createdAt);
  }

  list(filter: { status?: InboxItem['status'] } = {}): InboxItem[] {
    const rows = filter.status
      ? this.db.prepare('SELECT * FROM inbox_items WHERE status = ? ORDER BY created_at, id').all(filter.status)
      : this.db.prepare('SELECT * FROM inbox_items ORDER BY created_at, id').all();
    return (rows as Row[]).map(toItem);
  }

  get(id: string): InboxItem | undefined {
    const r = this.db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id) as Row | undefined;
    return r ? toItem(r) : undefined;
  }

  /**
   * The card's conversation changed what an open item proposes: the new title and detail become
   * the current version, the old ones are kept (the card shows "ver como era").
   */
  revise(id: string, title: string, detail: string): InboxItem {
    const item = this.get(id);
    if (!item) throw new Error(`inbox item not found: ${id}`);
    if (item.status !== 'open') throw new Error(`inbox item already ${item.status}`);
    const versions = [...(item.versions ?? []), { title: item.title, detail: item.detail, at: new Date().toISOString() }];
    this.db.prepare("UPDATE inbox_items SET title = ?, detail = ?, version = ?, versions = ? WHERE id = ? AND status = 'open'")
      .run(title, detail, versions.length + 1, JSON.stringify(versions), id);
    return this.get(id)!;
  }

  resolve(id: string, status: Exclude<InboxItem['status'], 'open'>, answer?: string): InboxItem {
    const item = this.get(id);
    if (!item) throw new Error(`inbox item not found: ${id}`);
    if (item.status !== 'open') throw new Error(`inbox item already ${item.status}`);
    this.db.prepare("UPDATE inbox_items SET status = ?, answer = ? WHERE id = ? AND status = 'open'").run(status, answer ?? null, id);
    return { ...item, status, ...(answer ? { answer } : {}) };
  }
}
