import { useState } from 'react';
import { api, type Pipeline } from '../../api';

/** Begin a delivery: the esteira's inputs and how far to go. Opens its conversation. */
export function StartForm({ p, onStarted, onCancel }: { p: Pipeline; onStarted(conversationId: string): void; onCancel(): void }) {
  const [inputs, setInputs] = useState<Record<string, string>>(() => Object.fromEntries(p.inputs.map((i) => [i.name, i.options?.[0] ?? ''])));
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const { conversationId } = await api.startPipeline(p.name, inputs, destination || null);
      onStarted(conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <form className="pl-start" onSubmit={(e) => { e.preventDefault(); void start(); }}>
      {p.inputs.map((i) => (
        <label key={i.name} className="field">
          {i.name} <span className="muted small">{i.description}</span>
          {i.options?.length ? (
            <select value={inputs[i.name]} onChange={(e) => setInputs({ ...inputs, [i.name]: e.target.value })}>
              {i.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input value={inputs[i.name]} onChange={(e) => setInputs({ ...inputs, [i.name]: e.target.value })} />
          )}
        </label>
      ))}
      <label className="field">Até onde
        <select value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="">até o fim ({p.stages.at(-1)?.label})</option>
          {p.stages.slice(0, -1).map((s) => <option key={s.id} value={s.id}>até {s.label}</option>)}
        </select>
      </label>
      <p className="muted small">Com um destino, as passagens até lá seguem sem perguntar. Ações que pedem aprovação continuam pedindo.</p>
      {error && <p className="banner small" role="alert">{error}</p>}
      <div className="row gap8">
        <button type="submit" className="btn primary small" disabled={busy}>Começar</button>
        <button type="button" className="btn small" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
