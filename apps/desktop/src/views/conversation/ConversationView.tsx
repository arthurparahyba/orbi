import { useEffect, useState } from 'react';
import { api, isConfigChat, type InboxItem } from '../../api';
import { useLive } from '../../hooks';
import { Segmented } from '../../components/Segmented';
import { Chat } from './Chat';
import { ConversationList } from './ConversationList';
import { InboxPanel } from './InboxPanel';
import { Notebook } from './Notebook';
import { EsteiraPanel } from './EsteiraPanel';
import { needsYou } from './inbox';
import { showsPanel, stateOf } from './stage';

/**
 * The Conversas screen: the list by where each conversation is, the open one and, beside it, the
 * panel once there is something to follow (teaching, learned, doing), or Pendências on demand.
 */
type Filter = 'todas' | 'minhas' | 'agentes';

export function ConversationView({ openInbox, focus, onOpenConfig }: { openInbox: InboxItem[]; focus?: { id: string }; onOpenConfig(): void }) {
  // The stage comes from runs, learning cards and the brain: follow those too.
  const list = useLive(api.conversations, ['conversations', 'agents', 'runs', 'inbox', 'brain']);
  const [current, setCurrent] = useState<string | undefined>(focus?.id);
  const [filter, setFilter] = useState<Filter>('todas');
  const [inboxOpen, setInboxOpen] = useState(false);
  // "Ir até": the card to scroll to, once the conversation is open (n makes a repeated click count).
  const [target, setTarget] = useState<{ conversationId: string; inboxId: string; n: number }>();
  const goTo = (item: InboxItem) => {
    // A configuration chat lives on its own screen, not in this list.
    if (isConfigChat(item.conversationId)) return onOpenConfig();
    setCurrent(item.conversationId);
    setTarget((t) => ({ conversationId: item.conversationId, inboxId: item.id, n: (t?.n ?? 0) + 1 }));
  };
  const fromAgents = (list.data ?? []).some((c) => c.origin);
  const shown = list.data?.filter((c) => filter === 'todas' || (filter === 'agentes') === !!c.origin);
  const open = list.data?.find((c) => c.id === current);
  // A conversation that delivers an esteira: the panel follows the delivery as a whole.
  const delivery = useLive(() => (current ? api.pipelineRunIn(current) : Promise.resolve(null)), ['pipelines'], [current]);
  const esteira = delivery.data ?? undefined;
  const panel = !!open && (!!esteira || showsPanel(stateOf(open)));

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
    <div className={`conversa ${inboxOpen || panel ? 'with-side' : ''} ${esteira && !inboxOpen ? 'has-esteira' : ''}`}>
      <ConversationList items={shown} current={current} openInbox={openInbox} error={list.error} onPick={setCurrent} onNew={newConversation}
        filter={fromAgents && <Segmented<Filter> label="Mostrar" value={filter} onChange={setFilter} options={[{ value: 'todas', label: 'Todas' }, { value: 'minhas', label: 'Minhas' }, { value: 'agentes', label: 'Dos agentes' }]} />} />
      {current ? (
        <Chat key={current} id={current} target={target?.conversationId === current ? target : undefined} title={open?.title ?? ''} origin={open?.origin} state={stateOf(open)} model={open?.model}
          waiting={openInbox.filter(needsYou).length} inboxOpen={inboxOpen} onToggleInbox={() => setInboxOpen((o) => !o)} onTitled={list.reload}
          onDeleted={() => { setCurrent(list.data?.find((c) => c.id !== current)?.id); void list.reload(); }} />
      ) : !list.data ? (
        <div className="empty-chat muted">Carregando…</div>
      ) : (
        <div className="empty-chat">
          <p>Peça algo ao Orbi, ou explique como você faz uma tarefa para ele aprender e assumir.</p>
          <button type="button" className="btn primary" onClick={newConversation}>Nova conversa</button>
        </div>
      )}
      {/* Pendências takes the place of the panel while open. */}
      {inboxOpen
        ? <InboxPanel items={openInbox} current={current} onClose={() => setInboxOpen(false)} onOpen={(id) => (isConfigChat(id) ? onOpenConfig() : setCurrent(id))} onGoTo={goTo} />
        : open && (esteira ? <EsteiraPanel key={`esteira-${open.id}`} run={esteira} conversationId={open.id} /> : panel && <Notebook key={`painel-${open.id}`} id={open.id} />)}
    </div>
  );
}
