import { dispatch } from '@flue/runtime';
import { getRegisteredFlueAgents } from '@flue/runtime/internal';
import type { Events } from '../events.ts';
import { log } from '../observability/log.ts';

type Agent = Parameters<typeof dispatch>[0];
type Message = Parameters<typeof dispatch>[1];

/**
 * The agent function Flue registered for `agent`. Flue's build imports each agent by its
 * absolute path, and app.ts by a relative one: on Windows the two can be spelled differently
 * (drive letter, folder casing) and the bundle then holds TWO copies of the agent module. Only
 * one is registered, and dispatch() refuses the other ("target agent is not registered"), which
 * is what made answers and approvals on the cards (and MCP requests) never reach the Orbi there.
 * Same agent, other copy: use the registered one (matched by its function name).
 */
export function registeredAgent(agent: Agent, registered: ReadonlyArray<{ identity: string; agent: unknown }> = getRegisteredFlueAgents()): Agent {
  if (registered.length === 0 || registered.some((r) => r.agent === agent)) return agent;
  const name = (agent as { name?: string }).name;
  const same = registered.filter((r) => typeof r.agent === 'function' && (r.agent as { name?: string }).name === name);
  if (same.length === 1) {
    if (!warned) log.warn('o agente está duas vezes no build (caminhos escritos de jeitos diferentes): usando o registrado', { agent: name, identity: same[0].identity });
    warned = true;
    return same[0].agent as Agent;
  }
  return agent;
}
let warned = false;

/**
 * Sends a message to a conversation from outside it (an approval, a finished
 * demonstration, a follow-up) and announces it, so an app showing that
 * conversation picks up the new turn even if it hadn't started yet.
 */
export async function tellAgent(events: Pick<Events, 'emit'>, agent: Agent, message: Message) {
  let receipt: Awaited<ReturnType<typeof dispatch>>;
  try {
    receipt = await dispatch(registeredAgent(agent), message);
  } catch (error) {
    // An answer or approval that cannot reach the conversation must say so (in the log too).
    log.error('mensagem para a conversa não foi entregue', { conversation: message.id, error: String(error) });
    throw error;
  }
  log.info('mensagem entregue à conversa', { conversation: message.id, kind: typeof message.message === 'string' ? 'user' : message.message.kind, submission: (receipt as { submissionId?: string }).submissionId });
  events.emit('dispatched', message.id);
  return receipt;
}
