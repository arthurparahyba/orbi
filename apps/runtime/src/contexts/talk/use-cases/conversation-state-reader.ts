import type { OrbiServices } from '../../../services.ts';
import { conversationState, type ConversationState } from '../conversations/src/state.ts';

/**
 * Onde está cada conversa (ensinando, fazendo, aprendido, esteira), lido do cérebro: nada disso
 * fica guardado na conversa. Monta os mapas uma vez e devolve a pergunta por id, porque a lista
 * pergunta por todas elas — os dois casos de uso daqui (`listConversations` e
 * `conversationNotebook`) usam este mesmo leitor (documento 27).
 */

type Deps = Pick<OrbiServices, 'procedures' | 'inbox' | 'pipelines'>;

export function conversationStateReader(d: Deps): (id: string) => ConversationState {
  const openLearning = new Set(
    d.inbox.list({ status: 'open' }).filter((i) => i.kind === 'learning').map((i) => i.conversationId),
  );
  const learned = new Map<string, { name: string; level: 1 | 2 | 3; at: string }>();
  for (const pb of d.procedures.definition.playbooks()) {
    const previous = pb.learnedFrom ? learned.get(pb.learnedFrom) : undefined;
    if (pb.learnedFrom && (!previous || previous.at < pb.updatedAt)) {
      learned.set(pb.learnedFrom, { name: pb.name, level: pb.level, at: pb.updatedAt });
    }
  }
  return (id) => {
    const l = learned.get(id);
    const pipeline = d.pipelines.runs.inConversation(id);
    return conversationState({
      lastRun: d.procedures.execution.lastRunIn(id),
      learningOpen: openLearning.has(id),
      learned: l && { name: l.name, level: l.level },
      ...(pipeline ? { delivery: { pipeline: pipeline.pipeline, status: pipeline.status } } : {}),
    });
  };
}
