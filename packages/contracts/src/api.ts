/**
 * Shapes of the runtime's HTTP API (`/api/*`), as the desktop app reads them.
 * The runtime checks its own types against these in src/contract-check.ts, so a
 * change on one side that breaks the other fails `npm test` (typecheck).
 */
export interface ConversationInfo {
  id: string; title: string; createdAt: string; updatedAt: string;
  /** Set when a coding agent asked for this conversation over MCP. */
  origin?: ConversationOrigin;
}
export interface ConversationOrigin { agent: string; requestId: string; procedure: string | null; repo?: string; branch?: string; session?: string }
export interface InboxItem {
  id: string; kind: 'approval' | 'question' | 'learning' | 'secret'; conversationId: string; title: string; detail: string;
  approvalId?: string; routine?: string; createdAt: string; status: 'open' | 'approved' | 'denied' | 'answered';
  /** What the developer answered, for answered questions. */
  answer?: string;
}
export interface OntologyType { name: string; description: string; relations: Record<string, string>; requires: string[] }
export interface Entity { id: string; type: string; props: Record<string, unknown>; body: string; updatedAt: string }
export interface Edge { from: string; rel: string; to: string; attrs: Record<string, unknown>; validFrom: string; validTo: string | null }
export interface Gap { entity: string; type: string; missing: string }
export type Autonomy = 'observe' | 'ask' | 'auto';
export interface Playbook {
  name: string; description: string; appliesTo: string | null; trigger: string; autonomy: Autonomy;
  steps: Array<{ id: string; label: string; how: string }>; instructions: string;
  /** The playbook this one was made from ("variação de"). */
  variationOf: string | null; uses: number; successes: number; updatedAt: string;
}
export interface PlaybookRun {
  id: string; playbook: string; conversationId: string; status: 'running' | 'done' | 'failed' | 'waiting';
  steps: Array<{ id: string; label: string; status: string; note?: string }>; startedAt: string; finishedAt: string | null;
}
export interface BrainSnapshot {
  stats: { entities: number; edges: number; playbooks: number; openProposals: number; types: number };
  gaps: Gap[]; types: OntologyType[]; entities: Entity[]; edges: Edge[];
}
export interface Target { role: string; name: string; label?: string; context?: string }
export interface DemoAction { t: number; kind: string; url: string; title?: string; tab: number; target?: Target; value?: string; secret?: string; text: string }
export interface NarrationSegment { t: number; durationMs: number; status: 'pending' | 'done' | 'error'; text: string; error?: string }
export interface Recording {
  id: string; conversationId: string; status: 'recording' | 'transcribing' | 'done' | 'discarded'; startedAt: string; finishedAt?: string;
  startUrl?: string; actions: DemoAction[]; narration: NarrationSegment[]; secrets: string[]; narrated: boolean; transcriber?: string;
}
export interface SecretInfo { name: string; description: string; origin: string; createdAt: string; updatedAt: string }
export interface Health {
  model: string; codeModel: string; anthropicKey: boolean;
  /** 'anthropic' or the adapter's name; llmReady = has what it needs to answer. */
  llm?: string; llmReady?: boolean; codeFixer?: boolean;
  /** Plugins found at start; `error` says why one can't be used. */
  plugins?: Array<{ name: string; kind: string; dir: string; description?: string; error?: string }>; envFile?: string; dataDir?: string; vault?: string; stt?: string; demoPortal?: string;
  /** Folder commands run in, and where each allowed CLI was found (null = not installed). */
  workspace?: string; binaries?: Record<string, string | null>;
  chrome: { url: string; tools: number } | { error: string };
  brain: BrainSnapshot['stats'];
  /** Where coding agents connect to Orbi's MCP server. */
  mcpUrl?: string;
}
export type Category = 'comandos-leitura' | 'comandos-escrita' | 'navegador-leitura' | 'navegador-escrita' | 'codigo-teste' | 'codigo-producao' | 'aprender';

/** How much the model and the tools were used: tokens, estimated cost (USD) and time. */
export interface UsageTotals {
  turns: number;
  failedTurns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  /** Time waiting for the model, summed over turns. */
  modelMs: number;
  toolCalls: number;
  failedTools: number;
  toolMs: number;
}
export interface ConversationUsage extends UsageTotals {
  conversationId: string;
  title: string;
  model: string;
  lastAt: string;
}
export interface UsageReport {
  days: number;
  since: string;
  today: UsageTotals;
  period: UsageTotals;
  conversations: ConversationUsage[];
}

/** GET /api/brain/entities/:id */
export interface EntityDetail {
  entity: Entity;
  relations: { out: Edge[]; in: Edge[] };
  nearby: Array<{ id: string; depth: number }>;
  /** What deleting it takes along. */
  dependents: { relations: number };
}

/** A coding agent allowed to call Orbi's MCP server (one token each). */
export interface AgentClient {
  id: string; name: string; canDelegate: boolean; canTeach: boolean;
  createdAt: string; lastSeenAt: string | null; revokedAt: string | null;
}
/** POST /api/agents/clients answers with the token once; only its hash is kept. */
export interface AgentClientCreated { client: AgentClient; token: string }
export interface AgentRequestContext { repo?: string; branch?: string; session?: string }
export type AgentRequestStatus = 'running' | 'waiting' | 'done' | 'failed';
/** A task a coding agent delegated with orbi_delegate. */
export interface AgentRequest {
  id: string; clientId: string; agent: string; conversationId: string; task: string; procedure: string | null;
  context: AgentRequestContext; status: AgentRequestStatus; summary: string | null; links: string[];
  createdAt: string; finishedAt: string | null;
}
/** A procedure a coding agent suggested with orbi_teach; it waits for the developer. */
export interface AgentSuggestion {
  id: string; name: string; description: string; trigger: string;
  steps: Array<{ id: string; label: string; how: string }>; instructions: string; why: string;
  agents: string[]; count: number; similarTo: string[];
  status: 'open' | 'accepted' | 'rejected'; createdAt: string; updatedAt: string;
}
