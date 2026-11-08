import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';

/** Where the request came from, as the agent described it. */
export interface AgentRequestContext {
  repo?: string;
  branch?: string;
  session?: string;
}
export type AgentRequestStatus = 'running' | 'waiting' | 'done' | 'failed';

/**
 * A task a coding agent delegated (orbi_delegate). Each one is a conversation
 * in the app; this keeps who asked, for what, and the short result Orbi
 * reported back (agent_reply), which is what orbi_status returns.
 */
export interface AgentRequest {
  id: string;
  clientId: string;
  /** The client's name when the request was listed. */
  agent: string;
  conversationId: string;
  task: string;
  procedure: string | null;
  /** The esteira it started (orbi_run_pipeline), if any. */
  pipeline: string | null;
  context: AgentRequestContext;
  status: AgentRequestStatus;
  summary: string | null;
  links: string[];
  createdAt: string;
  finishedAt: string | null;
}

type Row = Record<string, unknown>;
const json = <T>(text: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(text)) as T;
  } catch {
    return fallback;
  }
};
const toRequest = (r: Row): AgentRequest => ({
  id: String(r.id),
  clientId: String(r.client_id),
  agent: r.agent ? String(r.agent) : 'agente removido',
  conversationId: String(r.conversation_id),
  task: String(r.task),
  procedure: r.procedure ? String(r.procedure) : null,
  pipeline: r.pipeline ? String(r.pipeline) : null,
  context: json<AgentRequestContext>(r.context, {}),
  status: String(r.status) as AgentRequestStatus,
  summary: r.summary ? String(r.summary) : null,
  links: json<string[]>(r.links, []),
  createdAt: String(r.created_at),
  finishedAt: r.finished_at ? String(r.finished_at) : null,
});

const SELECT = 'SELECT r.*, c.name AS agent FROM agent_requests r LEFT JOIN agent_clients c ON c.id = r.client_id';

export class AgentRequests {
  constructor(private readonly db: DatabaseSync) {}

  add(item: { clientId: string; conversationId: string; task: string; procedure: string | null; pipeline?: string | null; context: AgentRequestContext }): AgentRequest {
    const id = `req_${ulid().toLowerCase()}`;
    this.db
      .prepare('INSERT INTO agent_requests (id, client_id, conversation_id, task, procedure, pipeline, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, item.clientId, item.conversationId, item.task, item.procedure, item.pipeline ?? null, JSON.stringify(item.context), new Date().toISOString());
    return this.get(id)!;
  }

  get(id: string): AgentRequest | undefined {
    const r = this.db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
    return r ? toRequest(r) : undefined;
  }

  byConversation(conversationId: string): AgentRequest | undefined {
    const r = this.db.prepare(`${SELECT} WHERE r.conversation_id = ?`).get(conversationId) as Row | undefined;
    return r ? toRequest(r) : undefined;
  }

  list(limit = 100): AgentRequest[] {
    return (this.db.prepare(`${SELECT} ORDER BY r.created_at DESC, r.id DESC LIMIT ?`).all(limit) as Row[]).map(toRequest);
  }

  /** Requests made today (local midnight), for the counters on the Agentes screen. */
  countSince(iso: string): number {
    return Number((this.db.prepare('SELECT count(*) AS n FROM agent_requests WHERE created_at >= ?').get(iso) as Row).n);
  }

  /** Orbi reports the outcome (agent_reply). A finished request stays finished. */
  finish(id: string, outcome: { status: 'done' | 'failed'; summary: string; links?: string[] }): AgentRequest | undefined {
    this.db
      .prepare("UPDATE agent_requests SET status = ?, summary = ?, links = ?, finished_at = ? WHERE id = ? AND status IN ('running', 'waiting')")
      .run(outcome.status, outcome.summary.slice(0, 2000), JSON.stringify((outcome.links ?? []).slice(0, 10)), new Date().toISOString(), id);
    return this.get(id);
  }
}
