import type { OrbiConfig } from './config.ts';
import type { BrainStore } from './brain/store.ts';
import type { Inbox } from './conversations/inbox.ts';
import type { PolicyStore } from './autonomy/policy.ts';
import type { Conversations } from './conversations/conversations.ts';
import type { Vault } from './vault/vault.ts';
import type { SttSlot } from './voice/stt.ts';
import type { SharedChrome } from './browser/chrome.ts';
import type { BrowserMcp } from './browser/mcp/chrome-devtools.ts';
import type { Recorder } from './browser/recorder.ts';
import type { CodeFixer } from './code/claude-code.ts';
import type { ActiveLlm } from './llm/index.ts';
import type { Events } from './events.ts';
import type { UsageStore } from './observability/usage.ts';
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
 * so agents and tools can't receive these through parameters. They read them
 * with `services()`, which the entry point fills before the server starts.
 * Nothing is created at import: tests and scripts build their own set with
 * `createOrbi` and hand it over with `provideServices`.
 */
export interface OrbiServices {
  config: OrbiConfig;
  brain: BrainStore;
  inbox: Inbox;
  policy: PolicyStore;
  conversations: Conversations;
  vault: Vault;
  stt: SttSlot;
  chrome: SharedChrome;
  browser: BrowserMcp;
  recorder: Recorder;
  /** Claude Code fixes; null when the fixer is off (non-Anthropic LLM). */
  codeFixer: CodeFixer | null;
  llm: ActiveLlm;
  /** What changed, for the app (GET /api/events). */
  events: Events;
  /** Model and tool usage per conversation (fed by telemetry.ts). */
  usage: UsageStore;
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
