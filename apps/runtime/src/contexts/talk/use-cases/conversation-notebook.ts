import type { OrbiServices } from '../../../services.ts';
import { buildNotebook, type ConversationNotebook } from '../conversations/src/notebook.ts';
import { conversationStateReader } from './conversation-state-reader.ts';

/**
 * O caderno ao lado da conversa: onde ela está, os passos do procedimento em andamento, o que já
 * está resolvido e as entidades que o cérebro conhece. Numa esteira, os passos são os da etapa que
 * está rodando agora (a execução mais recente). Pedido de fora, pela tela.
 */

/** Não existe conversa com esse id. */
export interface NoConversation {
  refused: string;
}

type Deps = Pick<OrbiServices, 'conversations' | 'procedures' | 'inbox' | 'pipelines' | 'knowledge'>;

export function conversationNotebook(d: Deps, conversationId: string): ConversationNotebook | NoConversation {
  if (!d.conversations.get(conversationId)) return { refused: 'conversa' };

  const state = conversationStateReader(d)(conversationId);
  const lastRun = d.procedures.execution.lastRunIn(conversationId);
  const name = state.mode === 'aprendido' || state.mode === 'fazendo' ? state.playbook
    : state.mode === 'esteira' && lastRun ? lastRun.playbook : undefined;
  const running = state.mode === 'fazendo' || state.mode === 'esteira';

  return buildNotebook({
    conversationId,
    state,
    lastRun,
    procedure: name ? d.procedures.definition.playbook(name) : undefined,
    entities: d.knowledge.graph().entities,
    runIds: d.procedures.execution.runsIn(conversationId).map((r) => r.id),
    readiness: running && lastRun ? d.procedures.execution.readiness(lastRun.id) : [],
  });
}
