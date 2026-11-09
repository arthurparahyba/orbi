import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { BulbIcon, CheckIcon } from './Icons';
import { InboxContext } from './inboxContext';
import { ChatContext } from './ChatContext';
import { Markdown } from './Markdown';

type Known = Extract<UiComponent, { component: 'known' }>;
type Similar = Extract<UiComponent, { component: 'similar' }>;

const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

/** Track record in words: "4 de 4 deram certo", or "ainda não usado". */
function Record({ uses, successes }: { uses: number; successes: number }) {
  if (!uses) return <span>ainda não usado</span>;
  return <span><strong className={successes === uses ? 'ok' : ''}>{successes} de {uses}</strong> deram certo</span>;
}

/** The same thing as a playbook: one line, no card, and a way out. */
export function KnownLine({ c }: { c: Known }) {
  const chat = useContext(ChatContext);
  return (
    <p className="known-line">
      <CheckIcon size={14} />
      <span>Já sei fazer isso: <code>{c.playbook.name}</code> · <Record {...c.playbook} /></span>
      <button type="button" className="link-btn" onClick={() => chat.send(`Não é isso: não quero o ${c.playbook.name}.`)}>Não é isso?</button>
    </p>
  );
}

/** Similar, not the same: what Orbi knows, what it can reuse, what changes, and the choice. */
export function SimilarCard({ c }: { c: Similar }) {
  const inbox = useContext(InboxContext);
  const item = inbox.items.get(c.inboxId);
  const [busy, setBusy] = useState(false);
  const chosen = item && item.status !== 'open' ? item.answer : undefined;
  const choose = async (label: string) => {
    setBusy(true);
    try { await inbox.answer(c.inboxId, label); } finally { setBusy(false); }
  };

  return (
    <>
    {c.known && <Markdown text={c.known} />}
    <section className={`ui-card similar ${chosen ? 'is-answered' : ''}`} aria-label="Já sei algo parecido">
      <header className="ui-card-head">
        <span className="ui-icon info"><BulbIcon /></span>
        <strong>Já sei algo parecido</strong>
        <span className="pill info">{c.relation}</span>
      </header>
      <div className="similar-base">
        <div>
          <code>{c.playbook.name}</code>
          <span className="muted small block">{c.playbook.description}</span>
        </div>
        <div className="similar-record small muted">
          <Record {...c.playbook} />
          {c.playbook.learnedAt && <span className="block">aprendido em {day(c.playbook.learnedAt)}</span>}
        </div>
      </div>
      {(c.reuse.length > 0 || c.changes.length > 0) && (
        <div className="similar-cols">
          <div>
            <h4 className="ui-kicker">O que dá para aproveitar</h4>
            <ul>{c.reuse.map((r) => <li key={r} className="reuse">{r}</li>)}</ul>
          </div>
          <div>
            <h4 className="ui-kicker">O que muda</h4>
            <ul>{c.changes.map((r) => <li key={r} className="change">{r}</li>)}</ul>
          </div>
        </div>
      )}
      {c.suggestion && <p className="small similar-suggestion"><strong>Minha sugestão:</strong> {c.suggestion}</p>}
      {chosen ? (
        <p className="decided approved">Você escolheu: {chosen}</p>
      ) : (
        <>
          <div className="row gap wrap">
            {c.options.map((o, i) => (
              <button key={o.label} type="button" className={`btn ${i === 0 ? 'primary' : ''}`} disabled={busy} title={o.hint} onClick={() => choose(o.label)}>
                {o.label}
              </button>
            ))}
          </div>
          {c.options.some((o) => o.hint) && (
            <ul className="similar-hints small muted">{c.options.filter((o) => o.hint).map((o) => <li key={o.label}><strong>{o.label}:</strong> {o.hint}</li>)}</ul>
          )}
          <p className="small muted">Nada é guardado nem executado até você escolher.</p>
        </>
      )}
    </section>
    </>
  );
}
