import type { Agent } from './runtime-port.ts';

/**
 * Which agent answers a conversation. The Orbi answers every conversation; others take the ids
 * that start with their prefix (`config:` → the configuration chat). Filled once by the entry
 * point (app.ts), so an approval, an answer or a signal reaches the agent of that conversation.
 */
const routes: Array<{ prefix: string; agent: Agent }> = [];

export function routeConversations(prefix: string, agent: Agent): void {
  const at = routes.findIndex((r) => r.prefix === prefix);
  if (at >= 0) routes[at] = { prefix, agent };
  else routes.push({ prefix, agent });
}

export function agentFor(conversationId: string, fallback: Agent): Agent {
  return routes.find((r) => conversationId.startsWith(r.prefix))?.agent ?? fallback;
}
