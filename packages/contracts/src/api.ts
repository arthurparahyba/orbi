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
  id: string; kind: 'approval' | 'question' | 'learning' | 'secret' | 'pipeline'; conversationId: string; title: string; detail: string;
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
  /** What it hands over when it finishes, for the next stage of an esteira or an agent. */
  outputs: PlaybookOutput[];
}
export interface PlaybookOutput { name: string; description: string }
export interface PlaybookRun {
  id: string; playbook: string; conversationId: string; status: 'running' | 'done' | 'failed' | 'waiting';
  steps: Array<{ id: string; label: string; status: string; note?: string }>; startedAt: string; finishedAt: string | null;
  params: Record<string, string>; outputs: Record<string, string>;
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

/** GET /api/voice — the local transcription model: which, where, what is missing, state. */
export interface VoiceStatus {
  backend: 'local' | 'http' | 'off';
  url?: string;
  model: string;
  defaultModel: string;
  dir: string;
  host: string;
  offline: boolean;
  files: Array<{ path: string; present: boolean; bytes: number; url: string }>;
  complete: boolean;
  known: Array<{ id: string; size: string; note: string }>;
  status:
    | { state: 'idle' }
    | { state: 'downloading'; file?: string; progress?: number }
    | { state: 'ready' }
    | { state: 'error'; message: string };
}

/** Esteira: procedures in sequence (GET /api/pipelines). */
export interface PipelineInput { name: string; description: string; options?: string[] }
export interface PipelineOption { playbook: string; when?: { field: string; equals: string }; map?: Record<string, string> }
export interface PipelineStage { id: string; label: string; options: PipelineOption[]; passage: 'ask' | 'auto' }
export interface Pipeline {
  name: string; description: string; inputs: PipelineInput[]; stages: PipelineStage[]; uses: number; updatedAt: string;
  /** Parameters nothing hands over: the Orbi will ask at that stage. */
  gaps?: Array<{ stage: string; playbook: string; param: string }>;
}
export interface PipelineRunStage {
  id: string; label: string; playbook: string | null; runId: string | null;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  params: Record<string, string>; from: Record<string, string>; outputs: Record<string, string>;
  startedAt: string | null; finishedAt: string | null;
}
/** One delivery: an esteira running in a conversation. */
export interface PipelineRun {
  id: string; pipeline: string; conversationId: string; status: 'running' | 'waiting' | 'done' | 'cancelled';
  destination: string | null; inputs: Record<string, string>; stages: PipelineRunStage[]; current: number;
  requestedBy: string; skipQuestions: boolean;
  waiting: { kind: 'passage' | 'failure' | 'params'; stage: string; missing?: string[]; message?: string; inboxId?: string } | null;
  createdAt: string; updatedAt: string; finishedAt: string | null;
}
