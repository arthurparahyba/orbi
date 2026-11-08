import { useUiChannel } from './ui-channel.ts';
import { useGate } from './gate.ts';
import type { AgentContext } from './context.ts';
import { useTerminal } from './tools/terminal.ts';
import { useBrowser } from './tools/browser.ts';
import { useCode } from './tools/code.ts';
import { useBrain } from './tools/brain.ts';
import { useActiveRun, usePlaybooks } from './tools/playbooks.ts';
import { useVoice } from './tools/voice.ts';
import { useSimilar } from './tools/similar.ts';
import { useClock } from './tools/clock.ts';
import { useAgentRequest } from './tools/requests.ts';
import { useSecrets } from './tools/secrets.ts';
import { usePipelines } from './tools/pipelines.ts';

/**
 * Orbi's generic capabilities. Nothing here knows about CI, GMUD or portals:
 * those are playbooks Orbi learns and stores in the brain. Code only provides
 * hands (terminal, browser, Claude Code), memory (the brain), a voice
 * (components, questions) and a clock (follow-ups) — each in its own module
 * under tools/ — plus the autonomy gate around every action that changes something.
 */
export function useOrbi(conversationId: string) {
  const [activeRun, setActiveRun] = useActiveRun();
  const ui = useUiChannel(conversationId);
  const gated = useGate(conversationId, ui, () => activeRun);
  const ctx: AgentContext = { conversationId, ui, gated, activeRun, setActiveRun };

  // hands
  useTerminal(ctx);
  useBrowser(ctx);
  useCode(ctx);
  // memory
  useBrain(ctx);
  useSimilar(ctx);
  usePlaybooks(ctx);
  // voice and clock
  useVoice(ctx);
  useSecrets(ctx);
  usePipelines(ctx);
  useClock(ctx);
  // a coding agent asked for this conversation (MCP)
  useAgentRequest(ctx);

  return { activeRun };
}
