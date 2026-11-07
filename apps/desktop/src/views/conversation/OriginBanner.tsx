import type { ConversationOrigin } from '../../api';

/** On top of a conversation a coding agent asked for: who asked, from where, for which procedure. */
export function OriginBanner({ origin }: { origin: ConversationOrigin }) {
  return (
    <div className="origin-banner" role="note" aria-label="Origem do pedido">
      <span>Pedido por <strong>{origin.agent}</strong> pelo MCP</span>
      {origin.repo && <span>repositório <strong>{origin.repo}</strong>{origin.branch ? ` · ${origin.branch}` : ''}</span>}
      {origin.session && <span>sessão <strong>{origin.session}</strong></span>}
      <span>procedimento <strong>{origin.procedure ?? 'não indicado'}</strong></span>
      <span>A autonomia vale igual: o agente não aprova nada.</span>
    </div>
  );
}
