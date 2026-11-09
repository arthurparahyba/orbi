import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { api } from '../api';
import { InboxContext } from './inboxContext';
import { LEVEL_LABEL } from './effect';

/**
 * A playbook's autonomy changed at the end of a run. Filled by the runtime (what it now does
 * alone and still asks). It only informs: nobody has to click to go up; Manter undoes it.
 */
export function LevelCard({ c }: { c: Extract<UiComponent, { component: 'level' }> }) {
  const inbox = useContext(InboxContext);
  const note = c.inboxId ? inbox.items.get(c.inboxId) : undefined;
  const [busy, setBusy] = useState(false);
  const up = c.to > c.from;
  const from = c.from as 1 | 2 | 3;
  const to = c.to as 1 | 2 | 3;
  const keep = async () => {
    if (!c.inboxId) return;
    setBusy(true);
    try { await api.keepInbox(c.inboxId); } finally { setBusy(false); }
  };
  return (
    <section className={`ui-card level-card ${up ? 'is-up' : 'is-down'}`} data-inbox={c.inboxId}>
      <header className="ui-card-head">
        <span className="level-arrow" aria-hidden="true">{up ? '↑' : '↓'}</span>
        <strong>{c.playbook} {up ? 'subiu' : 'desceu'} para {LEVEL_LABEL[to]}</strong>
        <span className="muted small">N{from} → N{to}</span>
      </header>
      <p className="small">{c.reason[0]?.toUpperCase()}{c.reason.slice(1)}.{c.alone.length || c.asks.length ? ' Na próxima vez:' : ''}</p>
      {(c.alone.length > 0 || c.asks.length > 0) && (
        <div className="level-cols">
          <div><span className="level-col-title is-alone">Segue sozinho</span>{c.alone.length ? c.alone.map((a) => <span key={a}>{a}</span>) : <span className="muted">nada ainda</span>}</div>
          <div><span className="level-col-title is-asks">Ainda pergunta</span>{c.asks.map((a) => <span key={a}>{a}</span>)}<span className="muted">qualquer ação nova</span></div>
        </div>
      )}
      {c.next && <p className="muted small">{c.next}</p>}
      {up && note?.status === 'open' && (
        <div className="row gap">
          <button type="button" className="btn small" disabled={busy} onClick={keep}>Manter em {LEVEL_LABEL[from].split(' · ')[0]}</button>
        </div>
      )}
      {note && note.status !== 'open' && note.answer === 'mantido' && <p className="decided denied">Mantido em N{from}</p>}
    </section>
  );
}
