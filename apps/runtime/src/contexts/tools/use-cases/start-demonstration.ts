import type { OrbiServices } from '../../../services.ts';
import { UNTITLED_CONVERSATION } from '../../talk/index.ts';
import type { Recording } from '../browser/src/recorder.ts';

/**
 * Começar uma demonstração: o desenvolvedor ensina fazendo (e narrando) no navegador, e o Orbi
 * grava o que ele faz. Atravessa dois contextos — `tools` grava, `talk` dá nome à conversa — e é
 * pedido de fora (a tela, `POST /api/recordings`), então mora aqui (documento 27). Não fala com a
 * conversa nem com a tela: quem chama responde o 201, ou traduz a recusa em conflito.
 */

/** Já existe uma gravação acontecendo, ou o Chrome não deixou começar. */
export interface NotStarted {
  refused: string;
}

type Deps = Pick<OrbiServices, 'recorder' | 'conversations'>;

export async function startDemonstration(
  d: Deps,
  request: { conversationId: string; url?: string; narrated?: boolean },
): Promise<Recording | NotStarted> {
  const recording = await d.recorder
    .start(request.conversationId, { url: request.url || undefined, narrated: request.narrated })
    .catch((error: Error) => ({ refused: error.message }));
  if ('refused' in recording) return recording;

  // A conversa que ainda não tem nome passa a se chamar pelo que o desenvolvedor faz nela.
  if (d.conversations.get(request.conversationId)?.title === UNTITLED_CONVERSATION) {
    d.conversations.touch(request.conversationId, 'Demonstração no navegador');
  }
  return recording;
}
