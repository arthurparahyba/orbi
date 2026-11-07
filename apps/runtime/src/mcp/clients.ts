import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { ulid } from 'ulidx';

/**
 * Coding agents allowed to call Orbi's MCP server. Each has its own token:
 * that is how Orbi knows who asked and who taught. Only a hash of the token is
 * kept, so the token is shown once, when the agent is connected.
 */
export interface AgentClient {
  id: string;
  name: string;
  canDelegate: boolean;
  canTeach: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

type Row = Record<string, unknown>;
const toClient = (r: Row): AgentClient => ({
  id: String(r.id),
  name: String(r.name),
  canDelegate: Number(r.can_delegate) === 1,
  canTeach: Number(r.can_teach) === 1,
  createdAt: String(r.created_at),
  lastSeenAt: r.last_seen_at ? String(r.last_seen_at) : null,
  revokedAt: r.revoked_at ? String(r.revoked_at) : null,
});

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
/** Lets a burst of calls from one agent update `last_seen_at` once. */
const SEEN_EVERY_MS = 30_000;

export class AgentClients {
  constructor(private readonly db: DatabaseSync) {}

  create(name: string): { client: AgentClient; token: string } {
    const token = `orb_${randomBytes(24).toString('base64url')}`;
    const id = ulid();
    this.db
      .prepare('INSERT INTO agent_clients (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name.trim().slice(0, 80), hash(token), new Date().toISOString());
    return { client: this.get(id)!, token };
  }

  list(): AgentClient[] {
    return (this.db.prepare('SELECT * FROM agent_clients ORDER BY revoked_at IS NOT NULL, created_at DESC').all() as Row[]).map(toClient);
  }

  get(id: string): AgentClient | undefined {
    const r = this.db.prepare('SELECT * FROM agent_clients WHERE id = ?').get(id) as Row | undefined;
    return r ? toClient(r) : undefined;
  }

  /** The active client a bearer token belongs to (and marks it as seen). */
  authenticate(authorization: string | undefined): AgentClient | undefined {
    const token = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token.startsWith('orb_')) return undefined;
    const r = this.db.prepare('SELECT * FROM agent_clients WHERE token_hash = ? AND revoked_at IS NULL').get(hash(token)) as Row | undefined;
    if (!r) return undefined;
    const client = toClient(r);
    const now = new Date();
    if (!client.lastSeenAt || now.getTime() - Date.parse(client.lastSeenAt) > SEEN_EVERY_MS) {
      this.db.prepare('UPDATE agent_clients SET last_seen_at = ? WHERE id = ?').run(now.toISOString(), client.id);
      client.lastSeenAt = now.toISOString();
    }
    return client;
  }

  setPermissions(id: string, change: { canDelegate?: boolean; canTeach?: boolean }): AgentClient | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const canDelegate = change.canDelegate ?? current.canDelegate;
    const canTeach = change.canTeach ?? current.canTeach;
    this.db.prepare('UPDATE agent_clients SET can_delegate = ?, can_teach = ? WHERE id = ?').run(canDelegate ? 1 : 0, canTeach ? 1 : 0, id);
    return this.get(id);
  }

  /** The token stops working at once; the client stays listed so past requests keep their author. */
  revoke(id: string): AgentClient | undefined {
    if (!this.get(id)) return undefined;
    this.db.prepare('UPDATE agent_clients SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').run(new Date().toISOString(), id);
    return this.get(id);
  }
}
