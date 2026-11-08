import { useState } from 'react';
import { api, type Pipeline } from '../../api';
import { AlertIcon } from '../../components/Icons';

/**
 * Configuration problems the runtime finds (data that does not reach a stage, a step that asks
 * what the esteira already gives, a fixed value from an earlier stage), and a way to fix them:
 * the Orbi proposes the corrections in a conversation, for you to approve.
 */
export function PipelineWarnings({ p, onFixing }: { p: Pipeline; onFixing(conversationId: string): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const warnings = p.warnings ?? [];
  if (warnings.length === 0) return null;
  const fix = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onFixing((await api.fixPipeline(p.name)).conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ui-card pl-warnings" aria-label="Problemas de configuração">
      <header className="ui-card-head">
        <span className="ui-icon warn"><AlertIcon size={14} /></span>
        <strong>Os dados não passam direito entre as etapas</strong>
      </header>
      <ul className="small">{warnings.map((w, i) => <li key={i}><span className="muted">{w.stage}:</span> {w.text}</li>)}</ul>
      <div className="row gap">
        <button type="button" className="btn small primary" disabled={busy} onClick={fix}>Pedir correção ao Orbi</button>
        <span className="muted small">ele propõe as mudanças num cartão; nada muda sem você aprovar</span>
      </div>
      {error && <p className="small warn-text">{error}</p>}
    </section>
  );
}
