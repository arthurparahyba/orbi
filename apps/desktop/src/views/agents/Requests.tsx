import type { AgentRequest, InboxItem } from '../../api';
import { STATE_LABEL, requestState, timeAgo } from './connect';

/** Pedidos: every task an agent delegated, newest first. Each one opens its conversation. */
export function Requests(props: { data?: AgentRequest[]; error?: string; openInbox: InboxItem[]; onOpen(conversationId: string): void; onConnect(): void }) {
  if (!props.data) return <p className="muted pad">{props.error ? `Erro: ${props.error}` : 'Carregando…'}</p>;
  if (props.data.length === 0) {
    return (
      <div className="agents-empty">
        <p>Nenhum agente pediu nada ainda.</p>
        <p className="muted small">Conecte o Claude Code ou o Cursor e eles passam a delegar ao Orbi o trabalho repetitivo que ele já sabe fazer.</p>
        <button type="button" className="btn primary" onClick={props.onConnect}>Conectar um agente</button>
      </div>
    );
  }
  return (
    <div className="agents-table-wrap">
      <table className="agents-table">
        <thead>
          <tr><th scope="col">Pedido</th><th scope="col">Quem pediu</th><th scope="col">Onde</th><th scope="col">Estado</th><th scope="col">Quando</th><th scope="col"><span className="sr-only">Abrir</span></th></tr>
        </thead>
        <tbody>
          {props.data.map((r) => {
            const state = requestState(r, props.openInbox);
            const pending = props.openInbox.find((i) => i.conversationId === r.conversationId);
            return (
              <tr key={r.id}>
                <td>
                  <strong>{r.procedure ?? 'sem procedimento indicado'}</strong>
                  <span className="muted small block">{r.task}</span>
                  {r.summary && <span className={`small block ${r.status === 'failed' ? 'err-text' : ''}`}>{r.summary}</span>}
                </td>
                <td>{r.agent}{r.context.session && <span className="muted small block">sessão {r.context.session}</span>}</td>
                <td className="small">{r.context.repo ?? '—'}{r.context.branch && <span className="muted block">{r.context.branch}</span>}</td>
                <td>
                  <span className={`pill pill-${state}`}>{STATE_LABEL[state]}</span>
                  {pending && <span className="muted small block">{pending.title}</span>}
                </td>
                <td className="small muted">{timeAgo(r.createdAt)}</td>
                <td><button type="button" className="btn small" onClick={() => props.onOpen(r.conversationId)}>Abrir conversa</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
