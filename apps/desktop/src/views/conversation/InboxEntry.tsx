import { useContext, useState } from 'react';
import { api, type InboxItem } from '../../api';
import { AlertIcon, BulbIcon, KeyIcon } from '../../components/Icons';
import { InboxContext } from '../../components/UiComponents';
import { INBOX_KINDS, keepLabel, since } from './inbox';

const ICONS = { alert: AlertIcon, bulb: BulbIcon, key: KeyIcon };

/** One open item: what it is, where, and what you can do right here. */
export function InboxEntry({ item, here, onOpen, onGoTo }: { item: InboxItem; here: boolean; onOpen(): void; onGoTo(): void }) {
  const inbox = useContext(InboxContext);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const keep = keepLabel(item);
  const kind = INBOX_KINDS[item.kind];
  const Icon = ICONS[kind.icon];
  return (
    <div className={`inbox-item is-${item.kind}`}>
      <span className={`ui-icon ${kind.tone}`}><Icon size={14} /></span>
      <span className="inbox-body">
        <span className="inbox-kind">{kind.label} · {here ? 'esta conversa' : 'outra conversa'} · {since(item.createdAt)}</span>
        <span className="inbox-title">{item.title}</span>
        {kind.note && item.detail && <span className="inbox-detail">{item.detail}</span>}
        <span className="inbox-actions">
          {kind.approveHere && (
            <button type="button" className="btn small primary" disabled={busy} onClick={run(() => inbox.decide(item.id, 'approve'))}>Aprovar</button>
          )}
          {kind.note ? (
            <>
              {keep && <button type="button" className="btn small" disabled={busy} onClick={run(() => api.keepInbox(item.id))}>{keep}</button>}
              <button type="button" className="btn small" disabled={busy} onClick={run(() => api.dismissInbox(item.id))}>Ok</button>
            </>
          ) : here ? (
            <button type="button" className="btn small" onClick={onGoTo}>Ir até ↓</button>
          ) : (
            <button type="button" className="btn small" onClick={onGoTo}>Abrir conversa →</button>
          )}
          {kind.note && !here && <button type="button" className="link-btn small" onClick={onOpen}>ver conversa</button>}
        </span>
      </span>
    </div>
  );
}
