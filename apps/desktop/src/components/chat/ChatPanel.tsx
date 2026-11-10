import { useEffect, useMemo, type ReactNode } from 'react';
import { useFlueAgent, type FlueConversationMessage } from '@flue/react';
import { createFlueClient } from '@flue/sdk';
import { useChanges } from '../../hooks';
import { ChatContext } from '../ChatContext';
import { Composer } from './Composer';
import { Message, Working } from './Message';
import { workingState } from './tools';
import { contentKey } from './scroll';
import { useFollowBottom } from './useFollowBottom';
import { useGoTo } from './useGoTo';
import { useCatchUp } from './catchUp';

/** What the screen around the chat may read: to draw its header (state pill, copy button). */
export interface ChatState {
  messages: FlueConversationMessage[];
  visible: FlueConversationMessage[];
  busy: boolean;
  catchingUp: boolean;
  status: string;
  historyReady: boolean;
}

/**
 * A chat with one of the runtime's agents (the Orbi of the conversations, the configuration
 * agent…): messages, cards, catching up with turns started elsewhere, following the bottom and
 * the composer. Knows nothing about which agent it talks to: the screen gives the address and
 * what goes around it (header, banners, empty state, a dock).
 */
export function ChatPanel(props: {
  url: string;
  id: string;
  label: string;
  className?: string;
  header?(chat: ChatState): ReactNode;
  /** Between the header and the messages (banners, the delivery bar). */
  above?: ReactNode;
  /** When there is no message yet; gets `send` for suggestion chips. */
  empty?(send: (text: string) => void): ReactNode;
  /** Below the messages, above the composer (e.g. the browser-teaching dock). */
  dock?: ReactNode;
  /** "Ir até" a card of Pendências. */
  target?: { inboxId: string; n: number };
  /** What the message box says when empty. */
  placeholder?: string;
  /** Runs before a message is sent: return false to keep it (e.g. a chip that opens a panel). */
  beforeSend?(text: string, firstMessage: boolean): boolean;
}) {
  const { url, id, label } = props;
  const agent = useFlueAgent({ url });
  const busy = agent.status === 'submitted' || agent.status === 'streaming';
  const visible = agent.messages.filter((m) => m.display !== 'hidden');
  // Only follow new messages while the reader is at the bottom.
  const follow = useFollowBottom(id, contentKey(visible));
  useGoTo(follow.box, props.target, visible.length);

  // The runtime can write to this conversation out-of-band (an approval, an answer, a follow-up):
  // when it says so, catch up and resume live updates (catchUp.ts).
  const { refresh } = agent;
  const lastMsg = visible.at(-1);
  const signature = `${visible.length}:${lastMsg?.parts.length ?? 0}:${JSON.stringify(lastMsg?.parts.at(-1) ?? '').length}`;
  const catchUp = useCatchUp({ id, refresh, busy, signature });
  useChanges((c) => {
    if (c.topic === 'dispatched' && c.id === id) { void refresh(); catchUp.start(); }
    else if (c.topic === 'hello' && c.why === 'reconnect') void refresh();
  });
  const broken = agent.status === 'error';
  useEffect(() => {
    if (!broken) return;
    const back = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [refresh, broken]);

  // Stop: aborts the turn that is running (and what is queued behind it); it settles as "interrompida".
  const client = useMemo(() => createFlueClient({ url: new URL(url, window.location.href).toString() }), [url]);
  const stop = async () => { await client.abort().catch(() => undefined); refresh(); };
  const working = workingState(visible, busy || catchUp.catchingUp);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (props.beforeSend && !props.beforeSend(t, !visible.some((m) => m.role === 'user'))) return;
    follow.toBottom();
    await agent.sendMessage(t);
  };
  const state: ChatState = { messages: agent.messages, visible, busy, catchingUp: catchUp.catchingUp, status: agent.status, historyReady: agent.historyReady };

  return (
    <section className={props.className ?? 'chat'} aria-label={label}>
      {props.header?.(state)}
      {props.above}
      <ChatContext.Provider value={{ send: (t) => void send(t) }}>
        <div className="messages-wrap">
          <div className="messages" aria-live="polite" ref={follow.box} onScroll={follow.onScroll}>
            {!agent.historyReady && visible.length === 0 && <p className="muted pad loading">Carregando a conversa…</p>}
            {agent.historyReady && visible.length === 0 && props.empty?.((t) => void send(t))}
            {visible.map((m) => <Message key={m.id} m={m} />)}
            {working === 'thinking' && <Working />}
            {agent.error && <div className="banner small" role="alert">{friendlyError(agent.error.message)}</div>}
          </div>
          {follow.unread && <button type="button" className="btn small new-msgs" onClick={follow.toBottom}>Novas mensagens ↓</button>}
        </div>
      </ChatContext.Provider>
      {props.dock}
      <Composer onSend={send} placeholder={props.placeholder} busy={busy || catchUp.catchingUp} onStop={stop} />
    </section>
  );
}

/** Errors the developer can act on, said in words (the raw message stays at the end). */
export function friendlyError(message: string): string {
  if (/Provider is not configured|api[_ -]?key/i.test(message)) {
    return `O modelo não tem chave: falta ANTHROPIC_API_KEY no apps/runtime/.env (ou no .env da pasta de dados do app). Crie o arquivo a partir do .env.example, ponha a chave e reinicie o Orbi. (${message})`;
  }
  return message;
}

/** The pill most chat headers show. */
export function chatPill(c: ChatState): { tone: string; text: string } {
  if (c.busy || c.catchingUp) return { tone: 'running', text: 'Trabalhando…' };
  if (c.status === 'error') return { tone: 'failed', text: 'Erro' };
  return { tone: 'idle', text: c.historyReady ? 'Pronto' : 'Carregando…' };
}
