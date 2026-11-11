import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { api } from '../api';
import { AlertIcon, CheckIcon, XIcon } from './Icons';
import { categoryLabel, InboxContext } from './inboxContext';
import { LearningPreview } from './ui/LearningPreview';
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
  const [error, setError] = useState<string>();
  const status = item?.status ?? 'open';
  const learning = c.category === 'aprender';
  const effect = c.effect ? EFFECT_LABEL[c.effect] : undefined;
  const act = async (d: 'approve' | 'deny') => {
    setBusy(true);
    setError(undefined);
    try { await inbox.decide(c.inboxId, d); }
    catch (e) { setError(`Não chegou ao Orbi: ${(e as Error).message}. Tente de novo.`); }
    finally { setBusy(false); }
  };
  // "Sempre sozinho" (an MCP tool that does not delete): saved for the tool, then this one is approved.
  const alwaysAlone = async () => {
    if (!c.alwaysAlone) return;
    setBusy(true);
    setError(undefined);
    try { await api.setMcpTool(c.alwaysAlone.server, c.alwaysAlone.tool, { alone: true }); }
    catch (e) { setBusy(false); setError(`Não guardou: ${(e as Error).message}.`); return; }
    setBusy(false);
    await act('approve');
  };
  return (
    <section className={`ui-card approval is-${status}`} data-inbox={c.inboxId}>
      <header className="ui-card-head">
        <span className="ui-icon warn"><AlertIcon /></span>
        <span className="ui-kicker">{status === 'open' ? 'pede aprovação' : categoryLabel(c.category)}</span>
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
          {c.alwaysAlone && <button type="button" className="btn" disabled={busy} onClick={() => void alwaysAlone()} title="Aprova esta e as próximas chamadas desta ferramenta. Dá para voltar em Configurações › Ferramentas (MCP).">Sempre sozinho para {c.alwaysAlone.tool}</button>}
        </div>
      ) : (
        <p className={`decided ${status}`}>{status === 'approved' ? 'Aprovado' : 'Negado'}</p>
      )}
      {error && <p className="small err-text" role="alert">{error}</p>}
    </section>
  );
}
