import type { OrbiConfig } from './config.ts';
import type { BrainStore } from './brain/store.ts';
import type { Inbox } from './conversations/inbox.ts';
import type { PolicyStore } from './autonomy/policy.ts';
import type { Conversations } from './conversations/conversations.ts';
import type { Followups } from './followups/service.ts';
import type { Vault } from './vault/vault.ts';
import type { SttSlot } from './voice/stt.ts';
import type { SharedChrome } from './browser/chrome.ts';
import type { BrowserMcp } from './browser/mcp/chrome-devtools.ts';
import type { Recorder } from './browser/recorder.ts';
import type { CodeAgents, CodeFixer } from './code-agents/index.ts';
import type { ActiveLlm } from './llm/index.ts';
import type { ModelTiers } from './llm/choices.ts';
import type { ModelRoles } from './llm/roles.ts';
import type { McpServers } from './mcp-client/store.ts';
import type { McpHub } from './mcp-client/hub.ts';
import type { RunObservations } from './observability/run-observations.ts';
import type { KnowledgeCandidates } from './review/knowledge.ts';
import type { Events } from './events.ts';
import type { UsageStore } from './observability/usage.ts';
import type { ToolOutcomes } from './observability/tool-outcomes.ts';
import type { AgentClients } from './mcp/clients.ts';
import type { VoiceModel } from './voice/model.ts';
import type { PipelineRuns } from './pipelines/runs.ts';
import type { PipelineEngine } from './pipelines/engine.ts';
import type { AgentRequests } from './mcp/requests.ts';
import type { AgentSuggestions } from './mcp/suggestions.ts';

/**
 * Everything Orbi's code uses, created once by `createOrbi` (compose.ts).
 *
 * Flue discovers agents as plain functions and calls them with `{ id }` only,
 * so the agent can't receive these through parameters: it reads them once with
 * `services()`, which the entry point fills before the server starts, and hands
 * each capability only what it declared (agents/capability.ts). Tools never call
 * `services()` (test/capability.test.ts); the HTTP routes get the set from app.ts.
 * Nothing is created at import: tests and scripts build their own set with
 * `createOrbi` and hand it over with `provideServices`.
 */
export interface OrbiServices {
  config: OrbiConfig;
  brain: BrainStore;
  inbox: Inbox;
  policy: PolicyStore;
  conversations: Conversations;
  /** The Orbi waking itself up later in a conversation: scheduled, delivered, failed, cancelled. */
  followups: Followups;
  vault: Vault;
  stt: SttSlot;
  chrome: SharedChrome;
  browser: BrowserMcp;
  recorder: Recorder;
  /** Coding agents of this machine and which does each task (code-agents/). */
  codeAgents: CodeAgents;
  /** Investigations and fixes by those agents, in throwaway copies. */
  codeFixer: CodeFixer;
  llm: ActiveLlm;
  /** What running procedures read, until the end-of-run review looks for facts in it. */
  observations: RunObservations;
  /** Facts the knowledge reviewer found, per run, until the Orbi proposes them. */
  knowledge: KnowledgeCandidates;
  /** MCP servers the developer added (Autonomia › Ferramentas MCP) and the clients that reach them. */
  mcpServers: McpServers;
  mcpHub: McpHub;
  /** The model of each kind of work (talking, running, learning and correcting, the knowledge review). */
  modelRoles: ModelRoles;
  /** How costly each model is, as the developer classified them. */
  modelTiers: ModelTiers;
  /** What changed, for the app (GET /api/events). */
  events: Events;
  /** Model and tool usage per conversation (fed by telemetry.ts). */
  usage: UsageStore;
  /** The last tool call of each conversation and whether it failed. */
  toolOutcomes: ToolOutcomes;
  /** Coding agents that call Orbi over MCP: who they are, what they asked, what they suggested. */
  /** The local transcription model: which, where its files are, download and change. */
  voice: VoiceModel;
  /** Esteiras running: their state and the engine that decides each passage. */
  pipelines: { runs: PipelineRuns; engine: PipelineEngine };
  agents: { clients: AgentClients; requests: AgentRequests; suggestions: AgentSuggestions };
}

let current: OrbiServices | undefined;

export function provideServices(s: OrbiServices): void {
  current = s;
}

export function services(): OrbiServices {
  if (!current) throw new Error('Orbi não foi inicializado: a entrada (app.ts) chama createOrbi() e provideServices() antes de qualquer conversa');
  return current;
}
