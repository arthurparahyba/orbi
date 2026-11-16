import type { OrbiServices } from '../../../services.ts';
import type { ConversationInfo } from '../conversations/src/conversations.ts';
import type { ConversationState } from '../conversations/src/state.ts';
import { conversationStateReader } from './conversation-state-reader.ts';

/**
 * A lista da barra lateral: as conversas, onde cada uma está, e quem pediu a conversa quando foi
 * um agente de código (a lista mostra o selo). Pedido de fora, pela tela (`GET
 * /api/conversations`).
 */

/** De onde a conversa veio, quando não foi o desenvolvedor que a abriu. */
export interface ConversationOrigin {
  agent: string;
  requestId: string;
  procedure: string | null;
}

export interface ConversationCard extends ConversationInfo {
  state: ConversationState;
  origin?: ConversationOrigin & Record<string, unknown>;
}

type Deps = Pick<OrbiServices, 'conversations' | 'agents' | 'procedures' | 'inbox' | 'pipelines'>;

export function listConversations(d: Deps): ConversationCard[] {
  const asked = new Map(d.agents.requests.list(1000).map((r) => [r.conversationId, r]));
  const stateOf = conversationStateReader(d);

  return d.conversations.list().map((conversation) => {
    const request = asked.get(conversation.id);
    const state = stateOf(conversation.id);
    if (!request) return { ...conversation, state };
    const origin = { agent: request.agent, requestId: request.id, procedure: request.procedure, ...request.context };
    return { ...conversation, state, origin };
  });
}
