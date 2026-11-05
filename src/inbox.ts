import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ulid } from 'ulidx';

/**
 * What the "Pedem sua atenção" panel shows: approvals waiting for a decision and
 * questions Vigia asked. The app reads it over HTTP; decisions go back into the
 * agent conversation as signals (see app.ts).
 */
export type InboxKind = 'approval' | 'question' | 'learning';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  /** Agent conversation that raised it, e.g. `delivery:acme/api:fix/timeout`. */
  conversationId: string;
  title: string;
  detail: string;
  /** For approvals: the gated tool call id. */
  approvalId?: string;
  routine?: string;
  createdAt: string;
  status: 'open' | 'approved' | 'denied' | 'answered';
}

export class Inbox {
  private items: InboxItem[];
  constructor(private readonly file?: string) {
    this.items = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  }

  add(item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>): InboxItem {
    const created: InboxItem = { ...item, id: ulid(), createdAt: new Date().toISOString(), status: 'open' };
    this.items.push(created);
    this.save();
    return created;
  }

  list(filter: { status?: InboxItem['status'] } = {}): InboxItem[] {
    return this.items.filter((item) => !filter.status || item.status === filter.status);
  }

  get(id: string): InboxItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  resolve(id: string, status: Exclude<InboxItem['status'], 'open'>): InboxItem {
    const item = this.get(id);
    if (!item) throw new Error(`inbox item not found: ${id}`);
    if (item.status !== 'open') throw new Error(`inbox item already ${item.status}`);
    item.status = status;
    this.save();
    return item;
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }
}
