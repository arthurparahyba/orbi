import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import { transaction } from '../db/database.ts';

/** The sidebar list in the app. Flue keeps the transcripts; this keeps names and order. */
export interface ConversationInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** The model chosen for it; none = the default. */
  model?: string;
}

type Row = Record<string, unknown>;
const toInfo = (r: Row): ConversationInfo => ({ id: String(r.id), title: String(r.title), createdAt: String(r.created_at), updatedAt: String(r.updated_at), ...(r.model ? { model: String(r.model) } : {}) });

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

  /**
   * Deletes a conversation: it leaves the list, what waited for the developer
   * in it goes away, its follow-ups are cancelled and an agent that asked for
   * it is told it was deleted. Runs and the brain stay (they are history and
   * knowledge, not the chat). The transcript lives in Flue's store, which has
   * no delete: it is erased at the next start (purge.ts), before Flue opens it.
   */
  delete(id: string): boolean {
    if (!this.get(id)) return false;
    const now = new Date().toISOString();
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
      this.db.prepare('INSERT OR REPLACE INTO deleted_conversations (id, deleted_at) VALUES (?, ?)').run(id, now);
      this.db.prepare('DELETE FROM inbox_items WHERE conversation_id = ?').run(id);
      this.db.prepare("UPDATE followups SET status = 'cancelled', cancelled_by = 'conversa apagada' WHERE conversation_id = ? AND status IN ('scheduled', 'delivering')").run(id);
      this.db
        .prepare("UPDATE agent_requests SET status = 'failed', summary = 'O desenvolvedor apagou a conversa deste pedido.', finished_at = ? WHERE conversation_id = ? AND status IN ('running', 'waiting')")
        .run(now, id);
    });
    return true;
  }

  /** The model this conversation uses from its next turn; null = back to the default. */
  setModel(id: string, model: string | null): ConversationInfo | undefined {
    if (!this.get(id)) return undefined;
    this.db.prepare('UPDATE conversations SET model = ? WHERE id = ?').run(model, id);
    return this.get(id);
  }

  touch(id: string, title?: string): ConversationInfo | undefined {
    if (!this.get(id)) return undefined;
    const now = new Date().toISOString();
    if (title) this.db.prepare('UPDATE conversations SET updated_at = ?, title = ? WHERE id = ?').run(now, title.slice(0, 80), id);
    else this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, id);
    return this.get(id);
  }
}
