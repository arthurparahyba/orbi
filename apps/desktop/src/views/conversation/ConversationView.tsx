import { useEffect, useState } from 'react';
import { api, type ConversationInfo, type InboxItem } from '../../api';
import { useLive } from '../../hooks';
import { PlusIcon } from '../../components/Icons';
import { Segmented } from '../../components/Segmented';
import { Chat } from './Chat';
import { InboxPanel } from './InboxPanel';
import { needsYou } from './inbox';

/** The Conversa screen: conversation list, the open conversation and what waits for the developer. */
type Filter = 'todas' | 'minhas' | 'agentes';

export function ConversationView({ openInbox, focus }: { openInbox: InboxItem[]; focus?: { id: string } }) {
  const list = useLive(api.conversations, ['conversations', 'agents']);
  const [current, setCurrent] = useState<string | undefined>(focus?.id);
  const [filter, setFilter] = useState<Filter>('todas');
  // "Ir até": the card to scroll to, once the conversation is open (n makes a repeated click count).
  const [target, setTarget] = useState<{ conversationId: string; inboxId: string; n: number }>();
  const goTo = (item: InboxItem) => {
    setCurrent(item.conversationId);
    setTarget((t) => ({ conversationId: item.conversationId, inboxId: item.id, n: (t?.n ?? 0) + 1 }));
  };
  const fromAgents = (list.data ?? []).some((c) => c.origin);
  const shown = (list.data ?? []).filter((c) => filter === 'todas' || (filter === 'agentes') === !!c.origin);

  useEffect(() => {
    if (focus) setCurrent(focus.id);
  }, [focus]);

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
        {fromAgents && (
          <div className="conv-filter">
            <Segmented<Filter> label="Mostrar" value={filter} onChange={setFilter} options={[{ value: 'todas', label: 'Todas' }, { value: 'minhas', label: 'Minhas' }, { value: 'agentes', label: 'Dos agentes' }]} />
          </div>
        )}
        <ul>
          {shown.map((c: ConversationInfo) => {
            const pending = openInbox.filter((i) => i.conversationId === c.id && needsYou(i)).length;
            return (
              <li key={c.id}>
                <button type="button" className={`conv ${c.id === current ? 'active' : ''}`} onClick={() => setCurrent(c.id)}>
                  <span className="conv-title">{c.title}</span>
                  {c.origin && <span className="conv-origin">pedido por {c.origin.agent}{c.origin.repo ? ` · ${c.origin.repo}` : ''}</span>}
                  <span className="conv-meta">{new Date(c.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  {pending > 0 && <span className="badge">{pending}</span>}
                </button>
              </li>
            );
          })}
          {!list.data && <li className="muted pad">{list.error ? `Erro: ${list.error}` : 'Carregando…'}</li>}
          {list.data && list.data.length === 0 && <li className="muted pad">Nenhuma conversa ainda.</li>}
        </ul>
      </aside>
      {current ? (
        <Chat key={current} id={current} target={target?.conversationId === current ? target : undefined} title={list.data?.find((c) => c.id === current)?.title ?? ''} origin={list.data?.find((c) => c.id === current)?.origin} onTitled={list.reload}
          onDeleted={() => { setCurrent(list.data?.find((c) => c.id !== current)?.id); void list.reload(); }} />
      ) : !list.data ? (
        <div className="empty-chat muted">Carregando as conversas…</div>
      ) : (
        <div className="empty-chat">
          <p>Comece uma conversa para ensinar um procedimento ao Orbi ou pedir que ele execute algo que já sabe.</p>
          <button type="button" className="btn primary" onClick={newConversation}><PlusIcon size={14} /> Nova conversa</button>
        </div>
      )}
      <InboxPanel items={openInbox} current={current} onOpen={setCurrent} onGoTo={goTo} />
    </div>
  );
}
