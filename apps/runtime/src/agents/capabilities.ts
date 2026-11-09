import { useUiChannel } from './ui-channel.ts';
import { useGate } from './gate.ts';
import type { AgentContext } from './context.ts';
import { registerCapabilities, type Capability } from './capability.ts';
import type { OrbiServices } from '../services.ts';
import { terminal } from './tools/terminal.ts';
import { scripts } from './tools/scripts.ts';
import { browserCapability } from './tools/browser.ts';
import { code } from './tools/code.ts';
import { memory } from './tools/brain.ts';
import { useActiveRun, playbooks } from './tools/playbooks.ts';
import { voice } from './tools/voice.ts';
import { similar } from './tools/similar.ts';
import { clock } from './tools/clock.ts';
import { agentRequest } from './tools/requests.ts';
import { secrets } from './tools/secrets.ts';
import { pipelines } from './tools/pipelines.ts';

/**
 * Orbi's generic capabilities. Nothing here knows about CI, GMUD or portals:
 * those are playbooks Orbi learns and stores in the brain. Code only provides
 * hands (terminal, browser, the coding agent), memory (the brain), a voice
 * (components, questions) and a clock (follow-ups) — each in its own module
 * under tools/, declared with defineCapability (what it needs, how it registers) —
 * plus the autonomy gate around every action that changes something.
 * A new capability is a new module and one line here.
 */
export const CAPABILITIES: readonly Capability[] = [
  // hands
  terminal, scripts, browserCapability, code,
  // memory
  memory, similar, playbooks,
  // voice and clock
  voice, secrets, pipelines, clock,
  // a coding agent asked for this conversation (MCP)
  agentRequest,
];

/**
 * Registers a list of capabilities for one conversation, with the UI channel and the gate every
 * agent shares. Each agent (the Orbi, the configuration chat…) passes its own list. `all` comes
 * from the agent, the one place inside a conversation that reads the global parts.
 */
export function useCapabilities(conversationId: string, all: OrbiServices, list: readonly Capability[]) {
  const [activeRun, setActiveRun] = useActiveRun();
  const ui = useUiChannel(conversationId);
  const gated = useGate(conversationId, ui, () => activeRun, all);
  const ctx: AgentContext = { conversationId, ui, gated, activeRun, setActiveRun };
  registerCapabilities(list, ctx, all);
  return { activeRun };
}

/** The Orbi of the conversations, with every capability. */
export function useOrbi(conversationId: string, all: OrbiServices) {
  return useCapabilities(conversationId, all, CAPABILITIES);
}
