import type { InboxItem } from '../../api';
import { AlertIcon, BulbIcon } from '../../components/Icons';

/** Approvals, questions and learning waiting for the developer; a click opens their conversation. */
export function InboxPanel({ items, onOpen }: { items: InboxItem[]; onOpen(id: string): void }) {
  return (
    <aside className="inbox" aria-label="Pendências">
      <h2>Pendências <span className="muted">{items.length}</span></h2>
      {items.length === 0 && <p className="muted pad">Nada esperando por você.</p>}
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className="inbox-item" onClick={() => onOpen(i.conversationId)}>
              <span className={`ui-icon ${i.kind === 'learning' ? 'info' : 'warn'}`}>{i.kind === 'learning' ? <BulbIcon size={14} /> : <AlertIcon size={14} />}</span>
              <span>
                <span className="inbox-kind">{i.kind === 'approval' ? 'Aprovação' : i.kind === 'learning' ? 'Aprendizado' : 'Pergunta'}</span>
                <span className="inbox-title">{i.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
