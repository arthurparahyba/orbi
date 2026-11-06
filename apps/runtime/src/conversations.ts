import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ulid } from 'ulidx';

/** The sidebar list in the app. Flue keeps the transcripts; this keeps names and order. */
export interface ConversationInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export class Conversations {
  private items: ConversationInfo[];
  constructor(private readonly file?: string) {
    this.items = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  }

  create(title = 'Nova conversa'): ConversationInfo {
    const now = new Date().toISOString();
    const item = { id: `chat:${ulid().toLowerCase()}`, title, createdAt: now, updatedAt: now };
    this.items.unshift(item);
    this.save();
    return item;
  }

  list(): ConversationInfo[] {
    return [...this.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  touch(id: string, title?: string): ConversationInfo | undefined {
    const item = this.items.find((c) => c.id === id);
    if (!item) return undefined;
    item.updatedAt = new Date().toISOString();
    if (title) item.title = title.slice(0, 80);
    this.save();
    return item;
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }
}
