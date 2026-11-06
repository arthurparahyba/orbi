import { createContext, useContext, useState } from 'react';
import type { InboxItem, UiComponent } from '@orbi/contracts';
import { AlertIcon, BulbIcon, CheckIcon, ClockIcon, LinkIcon, XIcon } from './Icons';

/**
 * Draws the component catalog the agent sends on the `ui` channel. The shapes
 * come from @orbi/contracts, the same schema the runtime validates against.
 * Unknown components render as a small note instead of breaking the conversation.
 */
type StepStatus = Extract<UiComponent, { component: 'stepper' }>['steps'][number]['status'];
export type { UiComponent };

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
      {c.category === 'aprender' && <LearningPreview detail={c.detail} />}
      <button type="button" className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Esconder detalhes' : c.category === 'aprender' ? 'Ver dados brutos' : 'Ver detalhes'}
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

interface LearnItem { kind: string; payload: Record<string, any> }
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))];

/** What the Orbi is about to store, readable: the playbook as numbered steps, its trigger, parameters and the facts. */
function LearningPreview({ detail }: { detail: string }) {
  let items: LearnItem[] = [];
  try { items = (JSON.parse(detail).items ?? []) as LearnItem[]; } catch { return null; }
  const playbooks = items.filter((i) => i.kind === 'playbook').map((i) => i.payload);
  const facts = items.filter((i) => i.kind !== 'playbook');
  return (
    <div className="learn-preview">
      {playbooks.map((pb) => {
        const all = placeholders(JSON.stringify(pb));
        const params = all.filter((x) => !x.startsWith('segredo:'));
        const secrets = all.filter((x) => x.startsWith('segredo:')).map((x) => x.slice(8));
        return (
          <div key={pb.name} className="learn-pb">
            <div className="learn-pb-head">
              <span className="ui-kicker">Playbook</span> <strong>{pb.name}</strong>
              {pb.autonomy && <span className="pill tiny">{pb.autonomy === 'auto' ? 'automático' : pb.autonomy === 'observe' ? 'só observar' : 'pede aprovação'}</span>}
            </div>
            {pb.description && <p className="small">{pb.description}</p>}
            <dl className="learn-meta">
              {pb.trigger && <div><dt>Quando</dt><dd>{pb.trigger}</dd></div>}
              {pb.appliesTo && <div><dt>Vale para</dt><dd>todo {pb.appliesTo}</dd></div>}
              {params.length > 0 && <div><dt>Parâmetros</dt><dd>{params.map((x) => <code key={x}>{x}</code>)}</dd></div>}
              {secrets.length > 0 && <div><dt>Credenciais</dt><dd>{secrets.map((x) => <span key={x} className="secret-ref">🔒 {x}</span>)} <span className="muted">no cofre do sistema</span></dd></div>}
            </dl>
            <ol className="steps static">
              {(pb.steps ?? []).map((st: { id: string; label: string; how?: string }, i: number) => (
                <li key={st.id ?? i} className="step">
                  <span className="step-dot">{i + 1}</span>
                  <span className="step-body"><span className="step-label">{st.label}</span>{st.how && <span className="step-note">{st.how}</span>}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {facts.length > 0 && (
        <div className="learn-facts">
          <span className="ui-kicker">Fatos para o cérebro</span>
          <ul>
            {facts.map((f, i) => (
              <li key={i}>
                {f.kind === 'edge'
                  ? <><code>{f.payload.from}</code> <span className="muted">{f.payload.rel}</span> <code>{f.payload.to}</code></>
                  : f.kind === 'entity'
                    ? <><span className="pill tiny">{f.payload.type}</span> <code>{f.payload.id}</code></>
                    : <><span className="pill tiny">{f.kind}</span> {JSON.stringify(f.payload).slice(0, 120)}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
