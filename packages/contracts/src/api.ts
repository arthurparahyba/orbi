/**
 * Shapes of the runtime's HTTP API (`/api/*`), as the desktop app reads them.
 * The runtime checks its own types against these in src/contract-check.ts, so a
 * change on one side that breaks the other fails `npm test` (typecheck).
 */
export interface ConversationInfo {
  id: string; title: string; createdAt: string; updatedAt: string;
  /** Set when a coding agent asked for this conversation over MCP. */
  origin?: ConversationOrigin;
  /** The model chosen for this conversation; none = the default. */
  model?: string;
  /** Where the conversation is: teaching (and the stage), doing something known, or done teaching. Derived by the runtime. */
  state?: ConversationState;
}
export type TeachingStage = 'explicar' | 'ensaiar' | 'combinar' | 'aprender' | 'assumir';
export type ConversationState =
  | { mode: 'conversa' }
  | { mode: 'ensinando'; stage: Exclude<TeachingStage, 'assumir'> }
  | { mode: 'aprendido'; stage: 'assumir'; playbook: string; level: 1 | 2 | 3 }
  | { mode: 'fazendo'; playbook: string; status: 'running' | 'waiting' | 'done' | 'failed' }
  | { mode: 'esteira'; pipeline: string; status: 'running' | 'waiting' | 'done' | 'cancelled' };
/** The "O que estou aprendendo" panel: what the Orbi understood in a conversation, from the brain. */
export interface ConversationNotebook {
  state: ConversationState;
  intent?: string;
  steps: Array<{ label: string; status: 'pending' | 'running' | 'done' | 'failed' | 'waiting' | 'skipped' | 'planned'; note?: string }>;
  receives: string[];
  agreement?: { start: string; end: string; outside: string[]; corrections: Array<{ explained: string; actual: string }> };
  noted: Array<{ id: string; type: string }>;
  readiness: Array<{ label: string; known: boolean; detail: string }>;
  procedure?: {
    name: string; description: string; level: 1 | 2 | 3; levelMax: 1 | 2 | 3; uses: number; successes: number;
    nextLevel?: { level: 1 | 2 | 3; cleanRunsLeft: number };
  };
}
export interface ConversationOrigin { agent: string; requestId: string; procedure: string | null; repo?: string; branch?: string; session?: string }
export interface InboxItem {
  id: string; kind: 'approval' | 'question' | 'learning' | 'secret' | 'pipeline' | 'level' | 'code-change' | 'followup'; conversationId: string; title: string; detail: string;
  approvalId?: string; routine?: string; createdAt: string; status: 'open' | 'approved' | 'denied' | 'answered';
  /** What the developer answered, for answered questions. */
  answer?: string;
}
export interface OntologyType {
  name: string; description: string; relations: Record<string, string>; requires: string[];
  /** Declared properties (name → what it is) and what is known for every entity of the type (name → how). */
  props?: Record<string, string>; knows?: Record<string, string>;
}
export interface Entity {
  id: string; type: string; props: Record<string, unknown>; body: string; updatedAt: string;
  /** Other names it goes by, and where the fact came from ("cartao:…", "execucao:…"). */
  aliases?: string[]; source?: string;
}
/** What a procedure receives each time, typed by a concept when it has one. */
export interface PlaybookParam { name: string; concept?: string; description?: string }
export interface Edge { from: string; rel: string; to: string; attrs: Record<string, unknown>; validFrom: string; validTo: string | null }
export interface Gap { entity: string; type: string; missing: string }
export type Autonomy = 'observe' | 'ask' | 'auto';
export interface Playbook {
  name: string; description: string; appliesTo: string | null; trigger: string; autonomy: Autonomy;
  steps: Array<{ id: string; label: string; how: string }>; instructions: string;
  /** Over concepts: what it is for, what it receives, and the rehearsal that proved it. */
  intent?: string; inputs?: PlaybookParam[]; testedRun?: string | null;
  /** The playbook this one was made from ("variação de"). */
  variationOf: string | null; uses: number; successes: number; updatedAt: string;
  /** What it hands over when it finishes, for the next stage of an esteira or an agent. */
  outputs: PlaybookOutput[];
  /** Its own Python scripts, approved with it and run by name (run_script). */
  scripts: PlaybookScript[];
  /** Autonomy that grows with use: 1 Aprendendo, 2 Assistido, 3 Autônomo; the ceiling; who set it. */
  level: 1 | 2 | 3; levelMax: 1 | 2 | 3; levelBy: 'learned' | 'promoted' | 'demoted' | 'user'; cleanStreak: number;
}
export type ActionEffect = 'leitura' | 'local' | 'publica' | 'apaga';
/** An action a playbook already did in a run without deviation: repeats it on its own by level. */
export interface KnownAction { playbook: string; fingerprint: string; tool: string; effect: ActionEffect; summary: string; step: string | null; count: number; firstAt: string; lastAt: string }
export interface AutonomyEvent { id: string; subjectKind: 'playbook' | 'passage'; subject: string; from: string; to: string; reason: string; conversationId: string | null; createdAt: string }
/** GET /api/brain/playbooks/:name/autonomy */
/**
 * What the runtime found at the end of an execution (signal `review` in the conversation,
 * attribute `review` as JSON): each procedure that ran, its problems and level change,
 * and the esteira's configuration problems.
 */
/**
 * What one check of the review found in a run (apps/runtime/src/review/analyzers): a problem,
 * something that would make it run alone next time, or something to keep in the brain.
 */
export interface Finding { kind: 'problema' | 'melhoria' | 'aprender'; text: string; analyzer: string }
export interface ExecutionReview {
  runs: Array<{
    runId: string; playbook: string; status: 'done' | 'failed' | 'open';
    findings: Finding[];
    level?: { from: number; to: number; reason: string; inboxId?: string; alone: string[]; asks: string[] };
  }>;
  config: Array<{ stage: string; playbook: string; text: string }>;
  pipeline?: string;
  /** What the judge let change: only these steps of the procedure (docs/funcionalidades/19). */
  change?: Array<{ playbook: string; why: string; steps: string[] }>;
  /** A known problem that comes back every run: fix it once, at the root. */
  environment?: Array<{ noteId: string; playbook: string; problem: string; sintoma: string; causa?: string; solucao: string; raiz?: string; quemCorrige?: string; runs: number }>;
  /** Ideas not worth a change now: kept in the Cérebro, no card. */
  ideas?: Array<{ noteId: string; playbook: string; text: string; why: string }>;
}
/** GET /api/review-notes — what the review kept: ideas and environments to fix. */
export interface ReviewNote {
  id: string; playbook: string; kind: 'idea' | 'environment' | 'change'; subject: string; text: string; runId: string | null;
  conversationId: string; status: 'kept' | 'open' | 'dismissed' | 'done' | 'applied'; times: number; createdAt: string; updatedAt: string;
}
export interface PlaybookAutonomy { knownActions: KnownAction[]; events: AutonomyEvent[]; runsForN3: number }
export interface PlaybookOutput { name: string; description: string }
export interface PlaybookScript { name: string; description: string; code: string; effect?: 'local' | 'publica' }
export interface PlaybookRun {
  id: string; playbook: string; conversationId: string; status: 'running' | 'done' | 'failed' | 'waiting';
  steps: Array<{ id: string; label: string; status: string; note?: string }>; startedAt: string; finishedAt: string | null;
  params: Record<string, string>; outputs: Record<string, string>;
  kind?: 'run' | 'rehearsal';
  /** Inputs resolved to facts (passo 0), and whether the run learned them by itself. */
  resolved?: Record<string, { value: string; entity: string; learned: 'known' | 'alias' | 'created'; undone?: boolean }>;
  actions: Array<{ fingerprint: string; tool: string; effect: ActionEffect; summary: string; step: string | null }>;
  /** `recovered`: the same step got past it right away (the tool worked next), not a problem. */
  deviations: Array<{ kind: 'falha' | 'negado' | 'passo' | 'comando' | 'intervencao'; detail: string; tool?: string; step?: string | null; at: string; recovered?: boolean; command?: string; known?: boolean; problem?: string }>;
  /** Approvals asked during the run; model tokens and cost while it was open. */
  asked?: number;
  usage?: { tokensIn: number; tokensOut: number; costUsd: number };
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
  model: string; anthropicKey: boolean;
  /** 'anthropic' or the adapter's name; llmReady = has what it needs to answer. */
  llm?: string; llmReady?: boolean;
  /** Which coding agent does each task ("investigar: Claude Code · …"), or null when none is set. */
  codeAgent?: string | null;
  /** Plugins found at start; `error` says why one can't be used. */
  plugins?: Array<{ name: string; kind: string; dir: string; description?: string; error?: string }>; envFile?: string; dataDir?: string; vault?: string; stt?: string; demoPortal?: string;
  /** Folder commands run in, and where each allowed CLI was found (null = not installed). */
  workspace?: string; binaries?: Record<string, string | null>;
  chrome: { url: string; tools: number } | { error: string };
  brain: BrainSnapshot['stats'];
  /** Where coding agents connect to Orbi's MCP server. */
  mcpUrl?: string;
  /** Which build the runtime is, its process and where it runs from: the app warns when it is another build. */
  build?: string; pid?: number; runtimePath?: string;
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

/** GET /api/followups — the Orbi coming back later to a conversation (docs/funcionalidades/11). */
export interface Followup {
  id: string; conversationId: string; dueAt: string; note: string;
  status: 'scheduled' | 'delivering' | 'delivered' | 'failed' | 'cancelled';
  attempts: number; runId?: string | null; stepId?: string | null; createdAt: string;
  deliveredAt?: string | null; cancelledBy?: string | null; lastError?: string | null;
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
    | { state: 'loading' }
    | { state: 'ready' }
    | { state: 'error'; message: string };
}

/** Esteira: procedures in sequence (GET /api/pipelines). */
export interface PipelineInput { name: string; description: string; options?: string[]; default?: string }
export interface PipelineOption { playbook: string; when?: { field: string; equals: string }; map?: Record<string, string> }
export interface PipelineStage { id: string; label: string; options: PipelineOption[]; passage: 'ask' | 'auto' }
export interface Pipeline {
  name: string; description: string; inputs: PipelineInput[]; stages: PipelineStage[]; uses: number; updatedAt: string;
  /** Configuration problems: data that does not reach a stage, steps that ask what comes from before. */
  warnings?: Array<{ stage: string; playbook: string; text: string }>;
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

/** Coding agents of this machine (Autonomia › Agentes de código). */
export type CodeAgentTask = 'investigar' | 'corrigir';
export interface CodeAgent {
  id: string; name: string; binary: string;
  /** One-shot command: `{prompt}` is the request, `{modelo}` the task's model. */
  command: string; models: string[];
  source: 'catalogo' | 'ajuda' | 'manual' | 'env';
  /** `background` (default): hidden; `window`: a terminal window the developer sees and follows. */
  runIn: 'window' | 'background';
  lastTest: { at: string; ok: boolean; detail: string } | null;
  createdAt: string; updatedAt: string;
}
export interface CodeAgentAssignment { task: CodeAgentTask; agent: string; model: string | null }
export interface CodeAgentCatalogEntry { id: string; name: string; binary: string; command: string; models: string[]; note?: string }
/** GET /api/code-agents */
export interface CodeAgentsState { agents: CodeAgent[]; tasks: CodeAgentAssignment[]; catalog: CodeAgentCatalogEntry[] }

/** The model the Orbi thinks with (first opening, Autonomia › Modelo). */
export interface ModelOption {
  kind: string; label: string; description: string;
  source: 'plugin' | 'anthropic' | 'adapter';
  fields: Array<'apiKey' | 'baseUrl' | 'model'>;
  models: string[];
  error?: string; dir?: string;
}
/** GET /api/model */
export interface ModelStatus {
  ready: boolean; kind: string; model: string; label: string;
  problem?: string;
  /** A key is set (never the key itself). */
  keySet: boolean;
  options: ModelOption[];
}
/** GET /api/model/choices — the models a conversation may use (the active provider's), the default first. */
export interface ModelChoices {
  default: string;
  models: Array<{ id: string; tier?: 'cheap' | 'standard' | 'premium'; tierBy?: 'voce' | 'plugin' | 'conhecido' }>;
}
/** GET /api/model/roles — the model of each kind of work, and whether you set it. */
/** GET /api/browser/settings: how Orbi's browser runs. Ports are shown, not edited here. */
export interface ChromeSettings {
  /** proprio: Orbi's own profile; seu: attach to the developer's Chrome (remote debugging on). */
  browser: 'proprio' | 'seu';
  browserUrl: string | null;
  showWindow: boolean;
  autostart: boolean;
  profileDir: string;
  executablePath: string | null;
  /** The Chrome found on this machine, or why none was. */
  detected: string | null;
  detectError: string | null;
  port: number;
  debugPort: number;
}

export type ModelRoles = Record<'conversa' | 'executar' | 'aprender' | 'conhecimento', { model: string; set: boolean }>;
/** POST /api/model/test · PUT /api/model */
export interface ModelTestResult { ok: boolean; detail: string; model?: string }
