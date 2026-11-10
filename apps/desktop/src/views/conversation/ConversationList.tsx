import type { ReactNode } from 'react';
import type { ConversationInfo, InboxItem } from '../../api';
import { PlusIcon } from '../../components/Icons';
import { needsYou } from './inbox';
import { groupConversations, stateLine, stateOf } from './stage';

/** The left list: "Ensinar algo novo" and the conversations by where they are (Ensinando, Fazendo, Já sei fazer). */
export function ConversationList({ items, current, openInbox, error, filter, onPick, onNew }: {
  items?: ConversationInfo[]; filter?: ReactNode; current?: string; openInbox: InboxItem[]; error?: string; onPick(id: string): void; onNew(): void;
}) {
  const groups = groupConversations(items ?? []);
  return (
    <aside className="convs" aria-label="Conversas">
      <div className="convs-head">
        <button type="button" className="btn primary convs-new" onClick={onNew}><PlusIcon size={15} /> Ensinar algo novo</button>
      </div>
      {filter && <div className="conv-filter">{filter}</div>}
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <h3 className="convs-group">{g.title}</h3>
          <ul>
            {g.items.map((c) => {
              const pending = openInbox.filter((i) => i.conversationId === c.id && needsYou(i)).length;
              return (
                <li key={c.id}>
                  <button type="button" className={`conv ${c.id === current ? 'active' : ''}`} onClick={() => onPick(c.id)} aria-current={c.id === current ? 'true' : undefined}>
                    <span className="conv-title">{c.title}</span>
                    <span className="conv-meta">{stateLine(stateOf(c))}</span>
                    {c.origin && <span className="conv-origin">pedido por {c.origin.agent}{c.origin.repo ? ` · ${c.origin.repo}` : ''}</span>}
                    {pending > 0 && <span className="badge">{pending}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!items && <p className="muted pad">{error ? `Erro: ${error}` : 'Carregando…'}</p>}
      {items && items.length === 0 && <p className="muted pad">Nada ainda. Comece ensinando algo.</p>}
    </aside>
  );
}
