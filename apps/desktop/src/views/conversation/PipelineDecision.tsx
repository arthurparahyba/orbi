import { useState } from 'react';
import { api, type PipelineRun } from '../../api';

/** What the delivery waits for, and the buttons: go on, give the missing data, retry, skip or stop. */
export function PipelineDecision({ run, line }: { run: PipelineRun; line: string }) {
  const w = run.waiting!;
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const decide = async (decision: 'continue' | 'retry' | 'skip' | 'stop', extra?: Record<string, string>) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.decidePipeline(run.id, decision, extra);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const next = run.stages.find((s) => s.id === w.stage);
  return (
    <div className={`pl-decision ${w.kind}`} role="group" aria-label="Decisão da esteira">
      <p className="small"><strong>Esperando você:</strong> {line}</p>
      {w.kind === 'passage' && next && Object.keys(next.params).length === 0 && (
        <p className="small muted">Os dados para {next.label} são montados quando ela começar.</p>
      )}
      {w.kind === 'params' && (
        <div className="row gap8 small">
          {w.missing?.map((m) => (
            <label key={m} className="row gap8"><code>{m}</code>
              <input value={values[m] ?? ''} onChange={(e) => setValues({ ...values, [m]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      <div className="row gap8">
        {w.kind === 'passage' && <button type="button" className="btn small primary" disabled={busy} onClick={() => void decide('continue')}>Seguir para {next?.label}</button>}
        {w.kind === 'params' && (
          <button type="button" className="btn small primary" disabled={busy || w.missing?.some((m) => !values[m]?.trim())} onClick={() => void decide('continue', values)}>Continuar</button>
        )}
        {w.kind === 'failure' && (
          <>
            <button type="button" className="btn small primary" disabled={busy} onClick={() => void decide('retry')}>Tentar de novo</button>
            <button type="button" className="btn small" disabled={busy} onClick={() => void decide('skip')}>Pular esta etapa</button>
          </>
        )}
        <button type="button" className="btn small danger" disabled={busy} onClick={() => void decide('stop')}>Encerrar aqui</button>
      </div>
      {error && <p className="small err-text" role="alert">{error}</p>}
    </div>
  );
}
