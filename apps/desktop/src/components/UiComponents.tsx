import { createContext, useContext, useState } from 'react';
import { ScriptsPreview } from './ScriptsPreview';
import type { InboxItem, UiComponent } from '@orbi/contracts';
import { AlertIcon, BulbIcon, CheckIcon, ClockIcon, LinkIcon, XIcon } from './Icons';
import { KnownLine, SimilarCard } from './SimilarCards';
import { SecretCard } from './SecretCard';
import { PipelinePreview } from './PipelinePreview';
import { ApprovalCard } from './ApprovalCard';
import { LevelCard } from './LevelCard';
import type { PipelineDef } from '../views/pipelines/model';
import { CHANGE_LABEL, stepDiff, type Step } from './stepDiff';
import { api } from '../api';
import { useLive } from '../hooks';

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

export const CATEGORY_LABEL: Record<string, string> = {
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

interface LearnItem { kind: string; payload: Record<string, any> }
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))];

/** What the Orbi is about to store, readable: the playbook as numbered steps, its trigger, parameters and the facts. */
export function LearningPreview({ detail }: { detail: string }) {
  // A variation (or a replacement) is shown against the playbook it comes from.
  const known = useLive(api.playbooks, ['brain']);
  let items: LearnItem[] = [];
  try { items = (JSON.parse(detail).items ?? []) as LearnItem[]; } catch { return null; }
  const playbooks = items.filter((i) => i.kind === 'playbook').map((i) => i.payload);
  const pipelines = items.filter((i) => i.kind === 'pipeline').map((i) => i.payload);
  const facts = items.filter((i) => i.kind !== 'playbook' && i.kind !== 'pipeline');
  return (
    <div className="learn-preview">
      {playbooks.map((pb) => {
        // Script code is Python: its braces are not parameters.
        const all = placeholders(JSON.stringify({ ...pb, scripts: undefined }));
        const params = all.filter((x) => !x.startsWith('segredo:'));
        const secrets = all.filter((x) => x.startsWith('segredo:')).map((x) => x.slice(8));
        const baseName: string | undefined = pb.variationOf ?? known.data?.find((k) => k.name === pb.name)?.name;
        const base = baseName ? known.data?.find((k) => k.name === baseName) : undefined;
        return (
          <div key={pb.name} className="learn-pb">
            <div className="learn-pb-head">
              <span className="ui-kicker">Playbook</span> <strong>{pb.name}</strong>
              {pb.autonomy && <span className="pill tiny">{pb.autonomy === 'auto' ? 'automático' : pb.autonomy === 'observe' ? 'só observar' : 'pede aprovação'}</span>}
            </div>
            {base && (
              <p className="small muted learn-base">
                {pb.variationOf ? <>Variação de <code>{base.name}</code>; a base não muda.</> : <>Corrige o <code>{base.name}</code>: os passos marcados mudam, o resto fica.</>}
              </p>
            )}
            {pb.description && <p className="small">{pb.description}</p>}
            <dl className="learn-meta">
              {pb.trigger && <div><dt>Quando</dt><dd>{pb.trigger}</dd></div>}
              {pb.appliesTo && <div><dt>Vale para</dt><dd>todo {pb.appliesTo}</dd></div>}
              {params.length > 0 && <div><dt>Parâmetros</dt><dd>{params.map((x) => <code key={x}>{x}</code>)}</dd></div>}
              {Array.isArray(pb.outputs) && pb.outputs.length > 0 && <div><dt>Entrega</dt><dd>{pb.outputs.map((o: { name: string }) => <code key={o.name} className="out-name">{o.name}</code>)}</dd></div>}
              {secrets.length > 0 && <div><dt>Credenciais</dt><dd>{secrets.map((x) => <span key={x} className="secret-ref">🔒 {x}</span>)} <span className="muted">no cofre do sistema</span></dd></div>}
            </dl>
            {base ? <DiffSteps base={base.steps} next={pb.steps ?? []} /> : (
              <ol className="steps static">
                {(pb.steps ?? []).map((st: Step, i: number) => (
                  <li key={st.id ?? i} className="step">
                    <span className="step-dot">{i + 1}</span>
                    <span className="step-body"><span className="step-label">{st.label}</span>{st.how && <span className="step-note">{st.how}</span>}</span>
                  </li>
                ))}
              </ol>
            )}
            <ScriptsPreview base={base?.scripts} next={pb.scripts} hasBase={!!base && !pb.variationOf} />
          </div>
        );
      })}
      {pipelines.map((p) => <PipelinePreview key={p.name} p={p as PipelineDef} />)}
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

/** Steps marked against the base: igual, muda (with what it was), novo, sai. */
function DiffSteps({ base, next }: { base: Step[]; next: Step[] }) {
  let n = 0;
  return (
    <>
      <p className="diff-legend small muted">
        {(['same', 'changed', 'new', 'removed'] as const).map((k) => <span key={k} className={`diff-key is-${k}`}>{CHANGE_LABEL[k]}</span>)}
      </p>
      <ol className="steps static diff">
        {stepDiff(base, next).map(({ step, change, before }, i) => (
          <li key={`${step.id}-${i}`} className={`step is-${change}`}>
            <span className="step-dot">{change === 'removed' ? '–' : ++n}</span>
            <span className="step-body">
              <span className="step-label">{change === 'removed' ? <s>{step.label}</s> : step.label}</span>
              {change === 'changed' && before && <span className="step-note">antes: {before.label}{before.how && before.how !== step.how ? ` · ${before.how}` : ''}</span>}
              {change !== 'removed' && step.how && <span className="step-note">{step.how}</span>}
            </span>
            <span className="diff-tag">{CHANGE_LABEL[change]}</span>
          </li>
        ))}
      </ol>
    </>
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
    <section className={`ui-card question ${answered ? 'is-answered' : ''}`} data-inbox={c.inboxId}>
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
    case 'approval': return <ApprovalCard c={c} />;
    case 'level': return <LevelCard c={c} />;
    case 'question': return <Question c={c} />;
    case 'status': return <Status c={c} />;
    case 'table': return <Table c={c} />;
    case 'learning': return <Learning c={c} />;
    case 'known': return <KnownLine c={c} />;
    case 'similar': return <SimilarCard c={c} />;
    case 'secret': return <SecretCard c={c} />;
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
