import { useState } from 'react';
import { api } from '../../api';

/**
 * Encerrar a delivery that runs or got stuck (a stage that never closed). Asks once more in
 * place; the review that follows points out what was left open.
 */
export function EndDelivery({ runId }: { runId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!confirm) return <button type="button" className="link-btn small" onClick={() => setConfirm(true)}>encerrar</button>;
  const end = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.cancelPipelineRun(runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="row gap8 small">
      <span>Encerrar a entrega? O que já foi feito fica.</span>
      <button type="button" className="btn small danger" disabled={busy} onClick={end}>Encerrar</button>
      <button type="button" className="btn small" onClick={() => setConfirm(false)}>Voltar</button>
      {error && <span className="warn-text">{error}</span>}
    </span>
  );
}
