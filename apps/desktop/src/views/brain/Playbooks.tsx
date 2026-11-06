import { useState } from 'react';
import { api, type Autonomy, type Playbook, type PlaybookRun } from '../../api';
import { useLive } from '../../hooks';
import { Segmented } from '../../components/Segmented';
import { fmt } from './look';

const AUTONOMY_LABEL: Record<Autonomy, string> = { observe: 'Só observar', ask: 'Perguntar', auto: 'Automático' };

/** Learned procedures, each with its own autonomy. */
export function Playbooks() {
  const pbs = useLive(api.playbooks, ['brain']);
  const [open, setOpen] = useState<string>();
  if (!pbs.data) return <p className="muted pad">Carregando…</p>;
  if (pbs.data.length === 0) return <p className="muted pad">Nenhum procedimento aprendido ainda. Ensine um na tela Conversa.</p>;
  return (
    <div className="pb-list">
      {pbs.data.map((p: Playbook) => (
        <article key={p.name} className="pb">
          <header>
            <button type="button" className="pb-title" onClick={() => setOpen(open === p.name ? undefined : p.name)} aria-expanded={open === p.name}>
              <strong>{p.name}</strong>
              <span className="muted">{p.description}</span>
            </button>
            <div className="pb-meta">
              <span className="muted small">{p.uses} usos · {p.uses ? Math.round((p.successes / p.uses) * 100) : 0}% sucesso</span>
              <Segmented
                label={`Autonomia de ${p.name}`}
                value={p.autonomy}
                options={(['observe', 'ask', 'auto'] as Autonomy[]).map((a) => ({ value: a, label: AUTONOMY_LABEL[a] }))}
                onChange={async (a) => { await api.setPlaybookAutonomy(p.name, a); await pbs.reload(); }}
              />
            </div>
          </header>
          {open === p.name && (
            <div className="pb-body">
              <p className="muted small">Gatilho: {p.trigger}{p.appliesTo ? ` · aplica-se a ${p.appliesTo}` : ''}</p>
              <ol className="steps static">
                {p.steps.map((s, i) => <li key={s.id} className="step"><span className="step-dot">{i + 1}</span><span className="step-body"><span className="step-label">{s.label}</span><span className="step-note">{s.how}</span></span></li>)}
              </ol>
              {p.instructions && <pre className="code small">{p.instructions}</pre>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/** Recent playbook runs and the state of each step. */
export function Runs() {
  const runs = useLive(api.runs, ['runs']);
  if (!runs.data) return <p className="muted pad">Carregando…</p>;
  if (runs.data.length === 0) return <p className="muted pad">Nenhuma execução ainda.</p>;
  return (
    <div className="table-scroll pad-x">
      <table className="runs">
        <thead><tr><th scope="col">Playbook</th><th scope="col">Status</th><th scope="col">Passos</th><th scope="col">Início</th><th scope="col">Fim</th></tr></thead>
        <tbody>
          {runs.data.map((r: PlaybookRun) => (
            <tr key={r.id}>
              <td><strong>{r.playbook}</strong></td>
              <td><span className={`pill pill-${r.status}`}>{r.status === 'done' ? 'Concluído' : r.status === 'failed' ? 'Falhou' : r.status === 'waiting' ? 'Aguardando' : 'Executando'}</span></td>
              <td>
                <span className="mini-steps">
                  {r.steps.map((s) => <span key={s.id} className={`mini is-${s.status}`} title={`${s.label}: ${s.status}${s.note ? ` — ${s.note}` : ''}`} />)}
                </span>
              </td>
              <td className="muted">{fmt(r.startedAt)}</td>
              <td className="muted">{r.finishedAt ? fmt(r.finishedAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
