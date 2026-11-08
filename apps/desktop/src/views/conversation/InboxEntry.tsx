import { useContext, useState } from 'react';
import { api, type InboxItem } from '../../api';
import { AlertIcon, BulbIcon, KeyIcon } from '../../components/Icons';
import { InboxContext } from '../../components/UiComponents';
import { keepLabel, since } from './inbox';

const KIND_LABEL: Record<InboxItem['kind'], string> = {
  approval: 'Aprovação', learning: 'Aprendizado', question: 'Pergunta', secret: 'Credencial', pipeline: 'Esteira', level: 'Autonomia',
};

/** One open item: what it is, where, and what you can do right here. */
export function InboxEntry({ item, here, onOpen, onGoTo }: { item: InboxItem; here: boolean; onOpen(): void; onGoTo(): void }) {
  const inbox = useContext(InboxContext);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const keep = keepLabel(item);
  const icon = item.kind === 'learning' || item.kind === 'level' ? <BulbIcon size={14} /> : item.kind === 'secret' ? <KeyIcon size={14} /> : <AlertIcon size={14} />;
  return (
    <div className={`inbox-item is-${item.kind}`}>
      <span className={`ui-icon ${item.kind === 'learning' || item.kind === 'level' ? 'info' : 'warn'}`}>{icon}</span>
      <span className="inbox-body">
        <span className="inbox-kind">{KIND_LABEL[item.kind]} · {here ? 'esta conversa' : 'outra conversa'} · {since(item.createdAt)}</span>
        <span className="inbox-title">{item.title}</span>
        {item.kind === 'level' && item.detail && <span className="inbox-detail">{item.detail}</span>}
        <span className="inbox-actions">
          {item.kind === 'approval' && (
            <button type="button" className="btn small primary" disabled={busy} onClick={run(() => inbox.decide(item.id, 'approve'))}>Aprovar</button>
          )}
          {item.kind === 'level' ? (
            <>
              {keep && <button type="button" className="btn small" disabled={busy} onClick={run(() => api.keepInbox(item.id))}>{keep}</button>}
              <button type="button" className="btn small" disabled={busy} onClick={run(() => api.dismissInbox(item.id))}>Ok</button>
            </>
          ) : here ? (
            <button type="button" className="btn small" onClick={onGoTo}>Ir até ↓</button>
          ) : (
            <button type="button" className="btn small" onClick={onGoTo}>Abrir conversa →</button>
          )}
          {item.kind === 'level' && !here && <button type="button" className="link-btn small" onClick={onOpen}>ver conversa</button>}
        </span>
      </span>
    </div>
  );
}
