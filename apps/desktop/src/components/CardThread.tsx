import { useContext, useState } from 'react';
import { CardThreadContext } from './chat/cardThreadContext';
import { cardText, isCardMessage, threadCount } from './chat/cardThreads';
import { Message } from './chat/Message';

/**
 * "Perguntar sobre este cartão" (docs/funcionalidades/21): the card's own conversation, inside it.
 * Same conversation for the Orbi (whole history); here only what was said about this card.
 * Decided cards fold it into one line.
 */
export function CardThread({ card, title, context, decided }: { card: string; title: string; context: string; decided: boolean }) {
  const ctx = useContext(CardThreadContext);
  const thread = ctx?.threads.get(card) ?? [];
  const [open, setOpen] = useState<boolean>();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  if (!ctx) return null;
  const count = threadCount(thread);
  const shown = open ?? (thread.length > 0 && !decided);
  // Asked, and the Orbi has not answered yet.
  const waiting = thread.length > 0 && isCardMessage(thread.at(-1)!) && ctx.busy;
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setError(undefined);
    try { await ctx.send(card, title, context, t); setText(''); }
    catch (e) { setError(`Não chegou ao Orbi: ${(e as Error).message}`); }
    finally { setSending(false); }
  };
  if (!shown) {
    return (
      <button type="button" className="card-thread-link" onClick={() => setOpen(true)}>
        {count ? `${count} ${count === 1 ? 'mensagem' : 'mensagens'} sobre este cartão · abrir` : 'Perguntar sobre este cartão'}
      </button>
    );
  }
  return (
    <div className="card-thread" aria-label={`Conversa sobre: ${title}`}>
      {thread.map((m) => (isCardMessage(m)
        ? <div key={m.id} className="msg user"><div className="bubble">{cardText(m)}</div></div>
        : <Message key={m.id} m={m} />))}
      {waiting && <p className="muted small">O Orbi está respondendo…</p>}
      <form className="card-thread-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label className="sr-only" htmlFor={`ct-${card}`}>Perguntar sobre este cartão</label>
        <input id={`ct-${card}`} value={text} placeholder="Perguntar sobre este cartão…" disabled={sending} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn small" disabled={!text.trim() || sending}>{sending ? 'Enviando…' : 'Enviar'}</button>
      </form>
      {error && <p className="small err-text" role="alert">{error}</p>}
      {thread.length > 0 && <button type="button" className="link-btn small" onClick={() => setOpen(false)}>Recolher</button>}
    </div>
  );
}
