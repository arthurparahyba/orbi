import { api, type ConversationNotebook } from '../../api';
import { useLive } from '../../hooks';
import { BookIcon } from '../../components/Icons';
import { Agreed, Noted, Receives, Section, Steps } from './NotebookParts';
import { LEVELS, levelLine, usesLine } from './notebookLines';

/**
 * Beside the conversation: what the Orbi understood so far (teaching), the procedure it became
 * (learned) or the run with what it knows (doing). Everything comes from the brain, live.
 */
export function Notebook({ id }: { id: string }) {
  const nb = useLive(() => api.notebook(id), ['runs', 'inbox', 'brain', 'conversations'], [id]);
  const n = nb.data;
  const title = !n || n.state.mode === 'ensinando' ? 'O que estou aprendendo' : n.state.mode === 'aprendido' ? 'O que aprendi' : 'O que estou fazendo';
  return (
    <aside className="notebook" aria-label={title}>
      <h2><BookIcon size={15} /> {title}</h2>
      {!n ? <p className="muted">{nb.error ? `Erro: ${nb.error}` : 'Carregando…'}</p> : <Body n={n} />}
    </aside>
  );
}

function Body({ n }: { n: ConversationNotebook }) {
  if (n.state.mode === 'ensinando' && n.steps.length === 0 && !n.intent) {
    return <p className="muted">Conforme você explica e eu ensaio, aparece aqui o que estou entendendo: para que serve, os passos, o que recebe, onde começa e termina.</p>;
  }
  const p = n.procedure;
  return (
    <>
      {p && <Section title="Procedimento"><p><strong>{p.name}</strong></p><p className="muted">{p.description}</p></Section>}
      {n.intent && (!p || n.intent !== p.description) && <Section title="Para que serve"><p>{n.intent}</p></Section>}
      <Receives receives={n.receives} />
      {n.state.mode === 'fazendo' && n.readiness.length > 0 && (
        <Section title="O que eu sei">
          <ul className="nb-list">{n.readiness.map((r) => <li key={r.label} className={r.known ? '' : 'nb-unknown'}>{r.label} <span className="muted">· {r.detail}</span></li>)}</ul>
        </Section>
      )}
      {n.steps.length > 0 && (
        <Section title={n.state.mode === 'ensinando' ? 'Passos (do ensaio)' : 'Passos'}>
          <Steps steps={n.steps} numbered={n.state.mode === 'aprendido'} />
        </Section>
      )}
      {n.agreement && <Agreed agreement={n.agreement} />}
      {n.state.mode === 'ensinando' && !n.agreement && n.steps.length > 0 && (
        <Section title="Ainda não sei"><p className="muted">Onde começa e onde termina: combinamos quando o ensaio acabar.</p></Section>
      )}
      {p && n.state.mode === 'aprendido' && (
        <Section title="Autonomia">
          <p>{levelLine(p)}</p>
          <div className="nb-levels">
            {LEVELS.map((l) => <div key={l.level} className={`nb-level ${l.level === p.level ? 'now' : ''} ${l.level > p.levelMax ? 'off' : ''}`}><strong>N{l.level}</strong><span>{l.text}</span></div>)}
          </div>
          <p className="muted">{usesLine(p)}</p>
        </Section>
      )}
      <Noted noted={n.noted} />
    </>
  );
}
