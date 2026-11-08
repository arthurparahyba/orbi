import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { AlertIcon, CheckIcon, XIcon } from './Icons';
import { CATEGORY_LABEL, InboxContext, LearningPreview } from './UiComponents';
import { EFFECT_LABEL } from './effect';

/**
 * An action waiting for the developer, readable: what happens in plain words, its reach
 * (local, publishes outside, deletes), why it asks, and the command in one line. The raw
 * arguments stay behind "ver detalhes". `data-inbox` lets Pendências scroll to it.
 */
export function ApprovalCard({ c }: { c: Extract<UiComponent, { component: 'approval' }> }) {
  const inbox = useContext(InboxContext);
  const item = inbox.items.get(c.inboxId);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const status = item?.status ?? 'open';
  const learning = c.category === 'aprender';
  const effect = c.effect ? EFFECT_LABEL[c.effect] : undefined;
  const act = async (d: 'approve' | 'deny') => {
    setBusy(true);
    try { await inbox.decide(c.inboxId, d); } finally { setBusy(false); }
  };
  return (
    <section className={`ui-card approval is-${status}`} data-inbox={c.inboxId}>
      <header className="ui-card-head">
        <span className="ui-icon warn"><AlertIcon /></span>
        <span className="ui-kicker">{status === 'open' ? 'pede aprovação' : CATEGORY_LABEL[c.category] ?? c.category}</span>
        {c.step && <span className="muted small">{c.step}</span>}
      </header>
      <p className="ui-title">{c.title}</p>
      {learning && <LearningPreview detail={c.detail} />}
      {!learning && (effect || c.reason) && (
        <dl className="approval-facts">
          {effect && (<><dt>Alcance</dt><dd><span className={`effect is-${c.effect}`}>{effect.tag}</span> {effect.note}</dd></>)}
          {c.reason && (<><dt>Por que pede</dt><dd>{c.reason}</dd></>)}
        </dl>
      )}
      {c.command && <code className="approval-command">{c.command}</code>}
      <button type="button" className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Esconder detalhes' : learning ? 'Ver dados brutos' : 'ver detalhes'}
      </button>
      {open && <pre className="code small">{c.detail}</pre>}
      {status === 'open' ? (
        <div className="row gap">
          <button type="button" className="btn primary" disabled={busy} onClick={() => act('approve')}><CheckIcon size={14} /> Aprovar</button>
          <button type="button" className="btn" disabled={busy} onClick={() => act('deny')}><XIcon size={14} /> Negar</button>
        </div>
      ) : (
        <p className={`decided ${status}`}>{status === 'approved' ? 'Aprovado' : 'Negado'}</p>
      )}
    </section>
  );
}
