import type { Diagnoses, DiagnosisSettings } from './contexts/improvement/index.ts';
import type { OrbiConfig } from './config.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { Facts } from './contexts/knowledge/index.ts';
import type { Execution, PipelineDefs, Procedures, ProofRepo, RunCallRepo, StepLearningRepo } from './contexts/procedures/index.ts';
import type { Autonomy } from './contexts/trust/index.ts';
import type { Learning } from './contexts/learning/index.ts';
import type { Review } from './contexts/improvement/index.ts';
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
import type { AgentClients, AgentRequests, AgentSuggestions } from './contexts/agents/index.ts';
import type { Domains } from './contexts/knowledge/index.ts';
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
import type { VoiceModel } from './contexts/talk/index.ts';
import type { PipelineRuns } from './contexts/procedures/index.ts';
import type { PipelineEngine } from './contexts/procedures/index.ts';

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
  /** The database every context shares; only the composition and a migration touch it directly. */
  db: DatabaseSync;
  /** `knowledge`: the ontology, the facts and their search (documento 26). */
  knowledge: Facts;
  /** Os domínios do cérebro e as pontes entre eles (documento 28). */
  domains: Domains;
  /**
   * `procedures`: what the Orbi knows how to do and what it is doing. One key per module of the
   * context, so a call says where it goes: `procedures.execution.startRun(…)`.
   */
  procedures: {
    /** The procedure itself: save, edit, find; the scripts travel with it. */
    definition: Procedures;
    /** A run: steps, step 0, deviations, the attempts of a command. */
    execution: Execution;
    /** The esteiras as defined, and the passages each one asks about. */
    pipelineDefs: PipelineDefs;
    /** Which steps already ran as they are written (documento 25). */
    proofs: ProofRepo;
    /** What each step already tried, and how it went (documento 25). */
    learnings: StepLearningRepo;
    /** What each tool call of a run did (documento 24). */
    calls: RunCallRepo;
  };
  /** `trust`: the level a procedure sits at, how it rises and falls, the actions it knows. */
  trust: Autonomy;
  /** `learning`: what waits for the developer, and the batch that lands whole or not at all. */
  learning: Learning;
  /** `improvement`: what the end-of-run review keeps — ideas, environments, the scope of a change. */
  notes: Review;
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
  candidates: KnowledgeCandidates;
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
