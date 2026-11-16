import type { OrbiServices } from '../../../services.ts';
import { requestStatus, type RequestStatus } from '../server/src/status.ts';

/**
 * Onde está o pedido de um agente (`orbi_status`): curto, sem log e sem credencial. Só o agente
 * que pediu pode consultar — o id de outro cliente é tratado como pedido que não existe.
 */

/** O pedido não existe, ou não é deste agente. */
export interface NoRequest {
  refused: string;
}

type Deps = Pick<OrbiServices, 'agents' | 'procedures' | 'inbox' | 'pipelines'>;

export function requestProgress(d: Deps, requestId: string, clientId: string): RequestStatus | NoRequest {
  const request = d.agents.requests.get(requestId);
  if (!request || request.clientId !== clientId) return { refused: `pedido não encontrado: ${requestId}` };

  return requestStatus(
    request,
    d.procedures.execution.lastRunIn(request.conversationId),
    d.inbox.list({ status: 'open' }).filter((item) => item.kind !== 'level'),
    d.pipelines.runs.inConversation(request.conversationId),
  );
}
