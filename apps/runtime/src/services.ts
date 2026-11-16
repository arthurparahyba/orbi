import type { Diagnoses, DiagnosisSettings } from './contexts/improvement/index.ts';
import type { OrbiConfig } from './config.ts';
import type { BrainStore } from './brain.ts';
import type { Inbox } from './contexts/talk/index.ts';
import type { PolicyStore } from './contexts/trust/index.ts';
import type { Conversations } from './contexts/talk/index.ts';
import type { Followups } from './contexts/talk/index.ts';
import type { Vault } from './contexts/secrets/index.ts';
import type { SttSlot } from './contexts/talk/index.ts';
import type { SharedChrome } from './contexts/tools/index.ts';
import type { BrowserMcp } from './contexts/tools/index.ts';
import type { Recorder } from './contexts/tools/index.ts';
import type { CodeAgents, CodeFixer } from './contexts/tools/index.ts';
import type { ActiveLlm } from './contexts/models/index.ts';
import type { ModelTiers } from './contexts/models/index.ts';
import type { ModelRoles } from './contexts/models/index.ts';
import type { McpServers } from './contexts/tools/index.ts';
import type { McpHub } from './contexts/tools/index.ts';
import type { RunObservations } from './contexts/telemetry/index.ts';
import type { KnowledgeCandidates } from './contexts/improvement/index.ts';
import type { Events } from './events.ts';
import type { UsageStore } from './contexts/telemetry/index.ts';
import type { ToolOutcomes } from './contexts/telemetry/index.ts';
import type { AgentClients } from './mcp/clients.ts';
import type { VoiceModel } from './contexts/talk/index.ts';
import type { PipelineRuns } from './contexts/procedures/index.ts';
import type { PipelineEngine } from './contexts/procedures/index.ts';
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
  /** O que deu errado por culpa do Orbi ou de uma chamada do modelo (documento 24). */
  diagnoses: Diagnoses;
  /** Quem escreve o relatório do diagnóstico e quando (documento 24). */
  diagnosisSettings: DiagnosisSettings;
  /** Investigations and fixes by those agents, in throwaway copies. */
  codeFixer: CodeFixer;
  llm: ActiveLlm;
  /** What running procedures read, until the end-of-run review looks for facts in it. */
  observations: RunObservations;
  /** Facts the knowledge reviewer found, per run, until the Orbi proposes them. */
  knowledge: KnowledgeCandidates;
  /** MCP servers the developer added (Configurações › Ferramentas MCP) and the clients that reach them. */
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
