import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { api } from '../../api';
import { InboxContext } from '../inboxContext';
import { BulbIcon } from '../Icons';

type C = Extract<UiComponent, { component: 'code_change' }>;

/**
 * "Houve correção de código" (Pontos importantes): what changed, why, who fixed it, and whether
 * it went without asking. When it went alone, it stays in Pendências until seen.
 */
export function CodeChange({ c }: { c: C }) {
  const { items } = useContext(InboxContext);
  const item = c.inboxId ? items.get(c.inboxId) : undefined;
  const [seen, setSeen] = useState(false);
  const [diff, setDiff] = useState(false);
  const open = item?.status === 'open' && !seen;
  return (
    <section className="ui-card code-change" aria-label="Correção de código">
      <header className="ui-card-head">
        <span className="ui-icon info"><BulbIcon /></span>
        <strong>{c.title}</strong>
        <span className="pill">{c.alone ? 'seguiu sozinho' : 'aprovada por você'}</span>
      </header>
      <dl className="kv">
        <dt>O quê</dt><dd>{c.files.join(', ')}</dd>
        <dt>Por quê</dt><dd>{c.why}</dd>
        <dt>Quem</dt><dd>{c.agent}, numa cópia; commit do Orbi</dd>
        <dt>Onde</dt><dd>{c.repo} · {c.branch} · commit <code>{c.commit}</code></dd>
      </dl>
      {diff && c.diff && <pre className="code lang-diff">{c.diff.split('\n').map((l, i) => <span key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}{'\n'}</span>)}</pre>}
      <div className="row">
        {c.diff && <button type="button" className="btn small" onClick={() => setDiff((d) => !d)}>{diff ? 'Esconder diff' : 'Ver diff'}</button>}
        {open && <button type="button" className="btn small primary" onClick={async () => { await api.dismissInbox(c.inboxId!); setSeen(true); }}>Visto</button>}
      </div>
    </section>
  );
}
