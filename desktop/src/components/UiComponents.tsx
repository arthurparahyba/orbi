import { createContext, useContext, useState } from 'react';
import type { InboxItem } from '../api';
import { AlertIcon, BulbIcon, CheckIcon, ClockIcon, LinkIcon, XIcon } from './Icons';

/**
 * The component catalog the agent can send on the `ui` channel (runtime: src/ui.ts).
 * Unknown components render as a small note instead of breaking the conversation.
 */
type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'waiting' | 'skipped';
export type UiComponent =
  | { component: 'stepper'; id: string; title: string; status: 'running' | 'done' | 'failed' | 'waiting'; steps: Array<{ id: string; label: string; status: StepStatus; note?: string }> }
  | { component: 'status'; id: string; title: string; state: 'info' | 'running' | 'success' | 'warning' | 'error'; text: string }
  | { component: 'approval'; id: string; title: string; detail: string; category: string; inboxId: string }
  | { component: 'question'; id: string; question: string; options: string[]; inboxId: string }
  | { component: 'table'; id: string; title: string; columns: string[]; rows: string[][] }
  | { component: 'link'; id: string; title: string; url: string }
  | { component: 'code'; id: string; title: string; language: string; text: string }
  | { component: 'learning'; id: string; title: string; items: Array<{ kind: string; summary: string }>; inboxId: string };

export interface InboxActions {
  items: Map<string, InboxItem>;
  decide(id: string, decision: 'approve' | 'deny'): Promise<void>;
  answer(id: string, text: string): Promise<void>;
}
export const InboxContext = createContext<InboxActions>({ items: new Map(), decide: async () => {}, answer: async () => {} });

const CATEGORY_LABEL: Record<string, string> = {
  'comandos-leitura': 'Comando de leitura',
  'comandos-escrita': 'Comando que altera algo',
  'navegador-leitura': 'Navegador (leitura)',
  'navegador-escrita': 'Ação no navegador',
  'codigo-teste': 'Correção só em teste',
  'codigo-producao': 'Correção em código de produção',
  aprender: 'Aprendizado para o cérebro',
};

const STEP_MARK: Record<StepStatus, string> = { pending: '', running: '', done: '✓', failed: '✕', waiting: '…', skipped: '–' };

function Stepper({ c }: { c: Extract<UiComponent, { component: 'stepper' }> }) {
  const done = c.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return (
    <section className={`ui-card stepper is-${c.status}`} aria-label={`Playbook ${c.title}`}>
      <header className="ui-card-head">
        <span className="ui-kicker">Playbook</span>
        <strong>{c.title}</strong>
        <span className={`pill pill-${c.status}`}>{c.status === 'done' ? 'Concluído' : c.status === 'failed' ? 'Falhou' : c.status === 'waiting' ? 'Aguardando' : 'Executando'}</span>
      </header>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={c.steps.length} aria-valuenow={done}>
        <span style={{ width: `${(done / Math.max(c.steps.length, 1)) * 100}%` }} />
      </div>
      <ol className="steps">
        {c.steps.map((s) => (
          <li key={s.id} className={`step is-${s.status}`}>
            <span className="step-dot">{s.status === 'running' ? <span className="spinner" /> : STEP_MARK[s.status]}</span>
            <span className="step-body">
              <span className="step-label">{s.label}</span>
              {s.note && <span className="step-note">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Approval({ c }: { c: Extract<UiComponent, { component: 'approval' }> }) {
  const inbox = useContext(InboxContext);
  const item = inbox.items.get(c.inboxId);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const status = item?.status ?? 'open';
  const act = async (d: 'approve' | 'deny') => {
    setBusy(true);
    try { await inbox.decide(c.inboxId, d); } finally { setBusy(false); }
  };
  return (
    <section className={`ui-card approval is-${status}`}>
      <header className="ui-card-head">
        <span className="ui-icon warn"><AlertIcon /></span>
        <span className="ui-kicker">{CATEGORY_LABEL[c.category] ?? c.category}</span>
      </header>
      <p className="ui-title">{c.title}</p>
      <button type="button" className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Esconder detalhes' : 'Ver detalhes'}
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

function Question({ c }: { c: Extract<UiComponent, { component: 'question' }> }) {
  const inbox = useContext(InboxContext);
  const item = inbox.items.get(c.inboxId);
  const [text, setText] = useState('');
  const answered = item && item.status !== 'open';
  const send = async (value: string) => {
    if (!value.trim()) return;
    await inbox.answer(c.inboxId, value.trim());
    setText('');
  };
  return (
    <section className={`ui-card question ${answered ? 'is-answered' : ''}`}>
      <header className="ui-card-head"><span className="ui-kicker">Pergunta do Vigia</span></header>
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
    </section>
  );
}

function Status({ c }: { c: Extract<UiComponent, { component: 'status' }> }) {
  return (
    <section className={`ui-card status is-${c.state}`} role="status">
      <span className="status-dot">{c.state === 'running' ? <span className="spinner" /> : c.state === 'success' ? <CheckIcon size={14} /> : c.state === 'error' ? <XIcon size={14} /> : c.state === 'warning' ? <AlertIcon size={14} /> : <ClockIcon size={14} />}</span>
      <span>
        <strong>{c.title}</strong>
        <span className="muted block">{c.text}</span>
      </span>
    </section>
  );
}

function Table({ c }: { c: Extract<UiComponent, { component: 'table' }> }) {
  return (
    <section className="ui-card table-card">
      <header className="ui-card-head"><strong>{c.title}</strong></header>
      <div className="table-scroll">
        <table>
          <thead><tr>{c.columns.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{c.rows.map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function Learning({ c }: { c: Extract<UiComponent, { component: 'learning' }> }) {
  return (
    <section className="ui-card learning">
      <header className="ui-card-head"><span className="ui-icon info"><BulbIcon /></span><strong>{c.title}</strong></header>
      <ul>{c.items.map((it, i) => <li key={i}><span className="pill">{it.kind}</span> {it.summary}</li>)}</ul>
    </section>
  );
}

export function UiComponentView({ c }: { c: UiComponent }) {
  switch (c.component) {
    case 'stepper': return <Stepper c={c} />;
    case 'approval': return <Approval c={c} />;
    case 'question': return <Question c={c} />;
    case 'status': return <Status c={c} />;
    case 'table': return <Table c={c} />;
    case 'learning': return <Learning c={c} />;
    case 'link':
      return <a className="ui-card link-card" href={c.url} target="_blank" rel="noreferrer"><LinkIcon size={14} /> {c.title}</a>;
    case 'code':
      return (
        <section className="ui-card code-card">
          <header className="ui-card-head"><strong>{c.title}</strong><span className="muted">{c.language}</span></header>
          <pre className={`code lang-${c.language}`}>{c.language === 'diff' ? c.text.split('\n').map((l, i) => <span key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}{'\n'}</span>) : c.text}</pre>
        </section>
      );
    default:
      return <section className="ui-card muted">Componente desconhecido</section>;
  }
}
