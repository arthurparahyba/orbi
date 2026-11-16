import type { OrbiServices } from '../../../services.ts';
import { modelChoices } from '../../models/index.ts';
import type { ConversationInfo } from '../conversations/src/conversations.ts';

/**
 * Trocar o modelo de uma conversa. Atravessa dois contextos — `models` diz quais o provedor
 * oferece, `talk` guarda a escolha — e é pedido de fora, então mora aqui (documento 27). Um nome
 * digitado à mão que o provedor não oferece nunca chega ao agente.
 */

/** O modelo não existe, ou a conversa não existe. */
export interface ModelNotChosen {
  refused: 'modelo-desconhecido' | 'conversa-nao-existe';
  detail: string;
}

type Deps = Pick<OrbiServices, 'conversations' | 'llm'>;

export function chooseConversationModel(d: Deps, conversationId: string, model: string | null): ConversationInfo | ModelNotChosen {
  if (model && !modelChoices(d.llm, {}).models.some((m) => m.id === model)) {
    return { refused: 'modelo-desconhecido', detail: `o modelo ${model} não está entre os oferecidos` };
  }
  const conversation = d.conversations.setModel(conversationId, model);
  if (!conversation) return { refused: 'conversa-nao-existe', detail: conversationId };
  return conversation;
}
