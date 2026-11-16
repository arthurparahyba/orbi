/**
 * Os agentes de código que chamam o Orbi por MCP: quem pode, o que delegou e o que sugeriu.
 *
 * `agents` ainda não é um contexto do runtime (o código vive em `src/mcp/`): este arquivo já
 * separa o contrato pelo mesmo corte, para quando for.
 */

/** A coding agent allowed to call Orbi's MCP server (one token each). */
export interface AgentClient {
  id: string; name: string; canDelegate: boolean; canTeach: boolean;
  /** May start esteiras; off by default. */
  canRunPipelines: boolean;
  /** Its destination also authorizes passages that ask; off by default. */
  canSkipPassages: boolean;
  createdAt: string; lastSeenAt: string | null; revokedAt: string | null;
}

/** POST /api/agents/clients answers with the token once; only its hash is kept. */
export interface AgentClientCreated { client: AgentClient; token: string }

export interface AgentRequestContext { repo?: string; branch?: string; session?: string }

export type AgentRequestStatus = 'running' | 'waiting' | 'done' | 'failed';

/** A task a coding agent delegated with orbi_delegate. */
export interface AgentRequest {
  id: string; clientId: string; agent: string; conversationId: string; task: string; procedure: string | null;
  pipeline: string | null; context: AgentRequestContext; status: AgentRequestStatus; summary: string | null; links: string[];
  createdAt: string; finishedAt: string | null;
}

/** A procedure a coding agent suggested with orbi_teach; it waits for the developer. */
export interface AgentSuggestion {
  id: string; name: string; description: string; trigger: string;
  steps: Array<{ id: string; label: string; how: string }>; instructions: string; why: string;
  agents: string[]; count: number; similarTo: string[];
  status: 'open' | 'accepted' | 'rejected'; createdAt: string; updatedAt: string;
}
