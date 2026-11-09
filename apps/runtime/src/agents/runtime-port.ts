/**
 * Everything the Orbi uses from Flue, the agent runtime, in one place. The rest of the code
 * imports from here, never from '@flue/runtime' (test/runtime-port.test.ts checks it): updating
 * or replacing Flue touches this file and whatever its new shapes force, not the whole code.
 */
import { dispatch } from '@flue/runtime';
import { getRegisteredFlueAgents } from '@flue/runtime/internal';
import { log } from '../observability/log.ts';

// ── defining an agent: model, MCP, subagents, skills, tools ──────────────────
export { useModel, useMcpConnection, useSubagent, useSkill, useTool, defineTool, defineSkill, defineSubagent, defineMcpConnection } from '@flue/runtime';
// ── the turn: persistent state, its start, deliveries, the data channel to the app ──
export { usePersistentState, useAgentStart, useDelivery, useResponseStart, useDataWriter } from '@flue/runtime';
// ── around the agent: provider, observation, HTTP router, storage ────────────
export { setProvider, observe, type FlueObservation } from '@flue/runtime';
export { createAgentRouter } from '@flue/runtime/routing';
export { sqlite } from '@flue/runtime/node';

/** An agent as Flue takes it (the function with `agentName`). */
export type Agent = Parameters<typeof dispatch>[0];
/** A message for a conversation: the user's text or a signal. */
export type AgentMessage = Parameters<typeof dispatch>[1];
export type Receipt = Awaited<ReturnType<typeof dispatch>>;

/**
 * Delivers a message to a conversation (a new turn), through the agent Flue registered.
 */
export function deliver(agent: Agent, message: AgentMessage): Promise<Receipt> {
  return dispatch(registeredAgent(agent), message);
}

/**
 * The agent function Flue registered for `agent`. Flue's build imports each agent by its
 * absolute path, and app.ts by a relative one: on Windows the two can be spelled differently
 * (drive letter, folder casing) and the bundle then holds TWO copies of the agent module. Only
 * one is registered, and dispatch() refuses the other ("target agent is not registered"), which
 * is what made answers and approvals on the cards (and MCP requests) never reach the Orbi there.
 * Same agent, other copy: use the registered one, matched by its identity (the `agentName`
 * static, like Flue does) — the bundler may rename the copy's function (`Orbi$1`), so the
 * function name alone is not enough.
 */
export function registeredAgent(agent: Agent, registered: ReadonlyArray<{ identity: string; agent: unknown }> = getRegisteredFlueAgents()): Agent {
  if (registered.length === 0 || registered.some((r) => r.agent === agent)) return agent;
  const named = agent as { agentName?: unknown; name?: string };
  const identity = typeof named.agentName === 'string' ? named.agentName : named.name;
  const same = registered.filter((r) => typeof r.agent === 'function' && (r.identity === identity || (r.agent as { name?: string }).name === named.name));
  if (same.length === 1) {
    if (!warned) log.warn('o agente está duas vezes no build (caminhos escritos de jeitos diferentes): usando o registrado', { agent: identity, identity: same[0].identity });
    warned = true;
    return same[0].agent as Agent;
  }
  if (same.length === 0) log.error('agente não está entre os registrados no build', { agent: identity, registered: registered.map((r) => r.identity).join(', ') });
  return agent;
}
let warned = false;
