import { useEffect, useState } from 'react';
import { api, type ConversationInfo, type InboxItem } from '../../api';
import { useLive } from '../../hooks';
import { PlusIcon } from '../../components/Icons';
import { Chat } from './Chat';
import { InboxPanel } from './InboxPanel';

/** The Conversa screen: conversation list, the open conversation and what waits for the developer. */
export function ConversationView({ openInbox }: { openInbox: InboxItem[] }) {
  const list = useLive(api.conversations, ['conversations']);
  const [current, setCurrent] = useState<string | undefined>();

  useEffect(() => {
    if (!current && list.data?.length) setCurrent(list.data[0].id);
  }, [list.data, current]);

  const newConversation = async () => {
    const c = await api.createConversation();
    await list.reload();
    setCurrent(c.id);
  };

  return (
    <div className="conversa">
      <aside className="convs" aria-label="Conversas">
        <div className="convs-head">
          <h2>Conversas</h2>
          <button type="button" className="icon-btn" onClick={newConversation} title="Nova conversa" aria-label="Nova conversa"><PlusIcon size={16} /></button>
        </div>
        <ul>
          {(list.data ?? []).map((c: ConversationInfo) => {
            const pending = openInbox.filter((i) => i.conversationId === c.id).length;
            return (
              <li key={c.id}>
                <button type="button" className={`conv ${c.id === current ? 'active' : ''}`} onClick={() => setCurrent(c.id)}>
                  <span className="conv-title">{c.title}</span>
                  <span className="conv-meta">{new Date(c.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  {pending > 0 && <span className="badge">{pending}</span>}
                </button>
              </li>
            );
          })}
          {list.data && list.data.length === 0 && <li className="muted pad">Nenhuma conversa ainda.</li>}
        </ul>
      </aside>
      {current ? (
        <Chat key={current} id={current} title={list.data?.find((c) => c.id === current)?.title ?? ''} onTitled={list.reload} />
      ) : (
        <div className="empty-chat">
          <p>Comece uma conversa para ensinar um procedimento ao Orbi ou pedir que ele execute algo que já sabe.</p>
          <button type="button" className="btn primary" onClick={newConversation}><PlusIcon size={14} /> Nova conversa</button>
        </div>
      )}
      <InboxPanel items={openInbox} onOpen={setCurrent} />
    </div>
  );
}
