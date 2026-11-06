import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';

/** The sidebar list in the app. Flue keeps the transcripts; this keeps names and order. */
export interface ConversationInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;
const toInfo = (r: Row): ConversationInfo => ({ id: String(r.id), title: String(r.title), createdAt: String(r.created_at), updatedAt: String(r.updated_at) });

export class Conversations {
  constructor(private readonly db: DatabaseSync) {}

  create(title = 'Nova conversa'): ConversationInfo {
    const now = new Date().toISOString();
    const item = { id: `chat:${ulid().toLowerCase()}`, title, createdAt: now, updatedAt: now };
    this.insert(item);
    return item;
  }

  /** Inserts a conversation as is (used to import the old conversations.json). */
  insert(item: ConversationInfo): void {
    this.db.prepare('INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(item.id, item.title, item.createdAt, item.updatedAt);
  }

  list(): ConversationInfo[] {
    return (this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC, id DESC').all() as Row[]).map(toInfo);
  }

  get(id: string): ConversationInfo | undefined {
    const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Row | undefined;
    return r ? toInfo(r) : undefined;
  }

  touch(id: string, title?: string): ConversationInfo | undefined {
    if (!this.get(id)) return undefined;
    const now = new Date().toISOString();
    if (title) this.db.prepare('UPDATE conversations SET updated_at = ?, title = ? WHERE id = ?').run(now, title.slice(0, 80), id);
    else this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, id);
    return this.get(id);
  }
}
