import { useContext, useState } from 'react';
import { CardThreadContext } from './chat/cardThreadContext';
import { cardText, isCardMessage, threadCount } from './chat/cardThreads';
import { Message } from './chat/Message';
import { CheckIcon, SendIcon, XIcon } from './Icons';

type Decision = 'approve' | 'deny';

/**
 * The card's own conversation (docs/funcionalidades/21), always there and discreet: what was said
 * about this card, then one line with the field and, beside it, Aprovar and Negar, so the decision
 * comes after the conversation. Decided, it folds into one line. Same conversation for the Orbi.
 */
export function CardThread({ card, title, context, status, onDecide, deciding }: {
  card: string; title: string; context: string;
  status?: 'open' | 'approved' | 'denied' | 'answered';
  onDecide?(d: Decision): void; deciding?: boolean;
}) {
  const ctx = useContext(CardThreadContext);
  const thread = ctx?.threads.get(card) ?? [];
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [reread, setReread] = useState(false);
  if (!ctx) return null;
  const decided = status === 'approved' || status === 'denied';
  // Asked, and the Orbi has not answered (or is changing the card): the decision waits a moment.
  const waiting = sending || (thread.length > 0 && isCardMessage(thread.at(-1)!) && ctx.busy);
  const messages = thread.map((m) => (isCardMessage(m)
    ? <div key={m.id} className="msg user"><div className="bubble">{cardText(m)}</div></div>
    : <Message key={m.id} m={m} />));
  if (decided) {
    const n = threadCount(thread);
    return (
      <div className="card-decided">
        <span className={`pill ${status === 'approved' ? 'pill-done' : 'pill-failed'}`}>{status === 'approved' ? 'aprovado' : 'negado'}</span>
        {n > 0 && <span className="muted small">depois de {n} {n === 1 ? 'mensagem' : 'mensagens'} · <button type="button" className="link-btn small" onClick={() => setReread((r) => !r)}>{reread ? 'esconder a conversa' : 'ver a conversa'}</button></span>}
        {reread && <div className="card-thread">{messages}</div>}
      </div>
    );
  }
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setError(undefined);
    try { await ctx.send(card, title, context, t); setText(''); }
    catch (e) { setError(`Não chegou ao Orbi: ${(e as Error).message}`); }
    finally { setSending(false); }
  };
  return (
    <div className="card-thread" aria-label={`Conversa sobre: ${title}`}>
      {messages}
      {waiting && thread.length > 0 && <p className="muted small card-waiting">o Orbi está respondendo…</p>}
      <form className="card-bar" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className="card-field">
          <label className="sr-only" htmlFor={`ct-${card}`}>Pergunte ou peça uma mudança</label>
          <input id={`ct-${card}`} value={text} placeholder="Pergunte ou peça uma mudança…" disabled={sending} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="card-send" aria-label="Enviar" disabled={!text.trim() || sending}><SendIcon size={13} /></button>
        </div>
        {onDecide && <>
          <button type="button" className="btn primary pill-btn" disabled={waiting || deciding} onClick={() => onDecide('approve')}><CheckIcon size={14} /> Aprovar</button>
          <button type="button" className="btn pill-btn" disabled={waiting || deciding} onClick={() => onDecide('deny')}><XIcon size={14} /> Negar</button>
        </>}
      </form>
      {error && <p className="small err-text" role="alert">{error}</p>}
    </div>
  );
}
