import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { InboxContext } from '../inboxContext';

/** A question from the Orbi, answered right on the card. */
export function Question({ c }: { c: Extract<UiComponent, { component: 'question' }> }) {
  const inbox = useContext(InboxContext);
  const item = inbox.items.get(c.inboxId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const answered = item && item.status !== 'open';
  const send = async (value: string) => {
    if (!value.trim() || sending) return;
    setSending(true);
    setError(undefined);
    try {
      await inbox.answer(c.inboxId, value.trim());
      setText('');
    } catch (e) {
      // The answer did not reach the Orbi: the card stays open (nothing silently lost).
      setError(`Não chegou ao Orbi: ${(e as Error).message}. Tente de novo.`);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className={`ui-card question ${answered ? 'is-answered' : ''}`} data-inbox={c.inboxId}>
      <header className="ui-card-head"><span className="ui-kicker">Pergunta do Orbi</span></header>
      <p className="ui-title">{c.question}</p>
      {answered ? (
        <p className="decided approved">Respondida</p>
      ) : (
        <>
          {c.options.length > 0 && (
            <div className="row gap wrap">
              {c.options.map((o) => (
                <button key={o} type="button" className="btn" onClick={() => send(o)}>{o}</button>
              ))}
            </div>
          )}
          <form className="inline-answer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <label className="sr-only" htmlFor={`ans-${c.id}`}>Sua resposta</label>
            <input id={`ans-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ou escreva sua resposta…" />
            <button type="submit" className="btn" disabled={!text.trim()}>Responder</button>
          </form>
        </>
      )}
      {error && <p className="small err-text" role="alert">{error}</p>}
    </section>
  );
}
