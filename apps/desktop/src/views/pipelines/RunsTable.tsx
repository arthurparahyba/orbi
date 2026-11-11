import type { PipelineRun } from '../../api';
import { timeAgo } from '../autonomy/agents/connect';
import { inScope, runState, waitingLine } from './model';

/** Em andamento: every delivery, the stage it is in, and what it waits for. */
export function RunsTable({ runs, error, onOpen, onNew }: { runs?: PipelineRun[]; error?: string; onOpen(conversationId: string): void; onNew(): void }) {
  if (!runs) return <p className="muted pad">{error ? `Erro: ${error}` : 'Carregando…'}</p>;
  if (runs.length === 0) {
    return (
      <div className="agents-empty">
        <p>Nenhuma entrega ainda.</p>
        <p className="muted small">Comece uma em Minhas esteiras, ou peça na conversa: "entrega o portal até a abertura da GMUD".</p>
        <button type="button" className="btn primary" onClick={onNew}>Ver minhas esteiras</button>
      </div>
    );
  }
  return (
    <div className="agents-table-wrap">
      <table className="agents-table">
        <thead><tr><th scope="col">Entrega</th><th scope="col">Etapas</th><th scope="col">Estado</th><th scope="col">Desde</th><th scope="col"><span className="sr-only">Abrir</span></th></tr></thead>
        <tbody>
          {runs.map((r) => {
            const state = runState(r);
            const stages = inScope(r);
            const scope = stages.filter((s) => !s.outside);
            return (
              <tr key={r.id}>
                <td>
                  <strong>{Object.values(r.inputs).join(' · ') || r.pipeline}</strong>
                  <span className="muted small block">{r.pipeline} · {r.destination ? `até ${r.stages.find((s) => s.id === r.destination)?.label}` : 'até o fim'}{r.requestedBy !== 'user' ? ` · pedido por ${r.requestedBy.replace(/^agent:/, '')}` : ''}</span>
                </td>
                <td>
                  <span className="pl-dots" aria-label={`etapa ${r.current + 1} de ${scope.length}`}>
                    {stages.map((s) => <span key={s.id} className={`pl-dot is-${s.status} ${s.outside ? 'outside' : ''}`} title={`${s.label}: ${s.status}`} />)}
                  </span>
                  <span className="muted small"> {Math.min(r.current + 1, scope.length)} de {scope.length} · {r.stages[r.current]?.label}</span>
                </td>
                <td>
                  <span className={`pill pill-${state.tone}`}>{state.label}</span>
                  {waitingLine(r) && <span className="muted small block">{waitingLine(r)}</span>}
                </td>
                <td className="small muted">{timeAgo(r.createdAt)}</td>
                <td><button type="button" className="btn small" onClick={() => onOpen(r.conversationId)}>Abrir conversa</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
