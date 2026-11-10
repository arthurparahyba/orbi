import { api } from '../../api';
import { useLive } from '../../hooks';

/** On the learning card: the rehearsal that proved the procedure works, and what it corrected. */
export function LearnTested({ runId }: { runId?: string }) {
  const runs = useLive(api.runs, ['brain']);
  if (!runId) return <p className="small warn-text">Não foi ensaiado: o Orbi ainda não tentou fazer isso com você.</p>;
  const run = runs.data?.find((r) => r.id === runId);
  if (!run) return <p className="small muted">Testado na execução {runId}.</p>;
  let fixes: Array<{ explained: string; actual: string }> = [];
  try { fixes = JSON.parse(run.outputs.acordo ?? '{}').corrections ?? []; } catch { /* no agreement */ }
  const when = new Date(run.finishedAt ?? run.startedAt).toLocaleDateString('pt-BR');
  return (
    <div className="learn-part">
      <p className="small"><span className="pill tiny">{run.kind === 'rehearsal' ? 'ensaiado' : 'testado'}</span> em {when}</p>
      {fixes.length > 0 && (
        <ul className="agreement-fixes small">
          {fixes.map((x, i) => <li key={i}><span className="muted">{x.explained}</span> → {x.actual}</li>)}
        </ul>
      )}
    </div>
  );
}
