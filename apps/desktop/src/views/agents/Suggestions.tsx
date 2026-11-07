import { useState } from 'react';
import { api, type AgentSuggestion } from '../../api';

/**
 * Sugestões: procedures agents think Orbi should learn. Nothing is in the
 * brain until you accept; accepted ones start asking before every action.
 */
export function Suggestions({ data, error }: { data?: AgentSuggestion[]; error?: string }) {
  if (!data) return <p className="muted pad">{error ? `Erro: ${error}` : 'Carregando…'}</p>;
  if (data.length === 0) {
    return (
      <div className="agents-empty">
        <p>Nenhuma sugestão esperando você.</p>
        <p className="muted small">Quando um agente faz algo repetitivo que o Orbi não sabe, ele pode sugerir o procedimento. Ele aparece aqui para você decidir.</p>
      </div>
    );
  }
  return (
    <div className="suggestions">
      {data.map((s) => <SuggestionCard key={s.id} s={s} />)}
    </div>
  );
}

function SuggestionCard({ s }: { s: AgentSuggestion }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const base = s.similarTo.find((n) => n !== s.name);
  return (
    <article className="suggestion" aria-labelledby={`sug-${s.id}`}>
      <header>
        <h2 id={`sug-${s.id}`}>{s.name}</h2>
        <span className="muted small">
          sugerido por {s.agents.join(', ')}{s.count > 1 ? ` · ${s.count} vezes` : ''}
        </span>
      </header>
      <p>{s.description}</p>
      {s.trigger && <p className="muted small">Quando: {s.trigger}</p>}
      {s.similarTo.length > 0 && <p className="small similar-note">Parecido com o que o Orbi já sabe: {s.similarTo.join(', ')}</p>}
      <ol className="sug-steps">
        {s.steps.map((st) => <li key={st.id}><strong>{st.label}</strong>{st.how && <span className="muted"> — {st.how}</span>}</li>)}
      </ol>
      {s.instructions && <p className="muted small">{s.instructions}</p>}
      {s.why && <p className="small">Por que vale a pena: {s.why}</p>}
      {error && <p className="banner small" role="alert">{error}</p>}
      <footer className="row gap8">
        <button type="button" className="btn small primary" disabled={busy} onClick={() => act(() => api.acceptSuggestion(s.id))}>Aceitar</button>
        {base && <button type="button" className="btn small" disabled={busy} onClick={() => act(() => api.acceptSuggestion(s.id, base))}>Aceitar como variação de {base}</button>}
        <button type="button" className="btn small" disabled={busy} onClick={() => act(() => api.rejectSuggestion(s.id))}>Rejeitar</button>
        <span className="muted small">Aceito, ele começa pedindo sua aprovação antes de agir. Dá para editar depois no Cérebro.</span>
      </footer>
    </article>
  );
}
