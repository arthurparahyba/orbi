import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { AlertIcon } from './Icons';
import { categoryLabel, InboxContext } from './inboxContext';
import { LearningVersion } from './ui/LearningVersion';
import { CardThread } from './CardThread';

/**
 * A learning card (docs/funcionalidades/21): the proposal, why, and below it the card's own
 * conversation ending in one line, field, Aprovar and Negar. The decision comes after the
 * conversation, on the proposal as it is now. `data-inbox` lets Pendências scroll to it.
 */
export function LearningCard({ c }: { c: Extract<UiComponent, { component: 'approval' }> }) {
  const inbox = useContext(InboxContext);
  const item = inbox.items.get(c.inboxId);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(false);
  const [error, setError] = useState<string>();
  const status = item?.status ?? 'open';
  const changed = !!item?.version && item.version > 1;
  const detail = changed ? item!.detail : c.detail;
  const decide = async (d: 'approve' | 'deny') => {
    setBusy(true);
    setError(undefined);
    try { await inbox.decide(c.inboxId, d); }
    catch (e) { setError(`Não chegou ao Orbi: ${(e as Error).message}. Tente de novo.`); }
    finally { setBusy(false); }
  };
  return (
    <section className={`ui-card approval learning-card is-${status}`} data-inbox={c.inboxId}>
      <header className="ui-card-head">
        <span className="ui-icon warn"><AlertIcon /></span>
        <span className="ui-kicker">{status === 'open' ? 'pede aprovação' : categoryLabel(c.category)}</span>
      </header>
      <p className="ui-title">{changed ? item!.title : c.title}{changed && status === 'open' && <span className="card-updated"> · atualizado</span>}</p>
      {status === 'open' && <LearningVersion detail={c.detail} why={c.why} item={item} />}
      <button type="button" className="link-btn" onClick={() => setRaw((o) => !o)} aria-expanded={raw}>{raw ? 'Esconder dados brutos' : 'Ver dados brutos'}</button>
      {raw && <pre className="code small">{detail}</pre>}
      {error && <p className="small err-text" role="alert">{error}</p>}
      <CardThread card={c.inboxId} title={changed ? item!.title : c.title} context={detail} status={status} onDecide={(d) => void decide(d)} deciding={busy} />
    </section>
  );
}
