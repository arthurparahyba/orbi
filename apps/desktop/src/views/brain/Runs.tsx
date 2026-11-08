import { api, type PlaybookRun } from '../../api';
import { useLive } from '../../hooks';
import { fmt } from './look';

const pairs = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${v.length > 40 ? `${v.slice(0, 40)}…` : v}`).join(' · ');

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
              <td>
                <strong>{r.playbook}</strong>
                {Object.keys(r.params).length > 0 && <span className="muted small block">recebeu {pairs(r.params)}</span>}
                {Object.keys(r.outputs).length > 0 && <span className="small block run-out">entregou {pairs(r.outputs)}</span>}
              </td>
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
