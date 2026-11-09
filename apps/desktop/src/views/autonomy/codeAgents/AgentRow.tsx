import { useState } from 'react';
import { api, type CodeAgent } from '../../../api';
import { agentState } from './model';
import { AgentEditor } from './AgentEditor';

/** One registered agent: state, command, and Testar / Editar / Remover. */
export function AgentRow({ agent, usedFor, onChanged }: { agent: CodeAgent; usedFor: string; onChanged(): void }) {
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string }>();
  const state = agentState(agent);
  const test = async () => {
    setTesting(true);
    try { setResult(await api.testCodeAgent(agent.id)); onChanged(); } finally { setTesting(false); }
  };
  if (editing) {
    return <div className="auto-row"><AgentEditor isNew={false} initial={{ ...agent, source: agent.source === 'env' ? 'manual' : agent.source }} onDone={(saved) => { setEditing(false); if (saved) onChanged(); }} /></div>;
  }
  const detail = result?.detail ?? agent.lastTest?.detail;
  return (
    <div className="auto-row ca-row">
      <div>
        <strong>{agent.name}</strong> <span className={`pill pill-${state.tone}`}>{state.label}</span>
        <p className="muted small"><code>{agent.command}</code></p>
        <p className="muted small">
          {agent.models.length ? `Modelos: ${agent.models.join(', ')}` : 'Usa o modelo padrão do agente'}
          {usedFor ? ` · usado para ${usedFor}` : ''}
          {detail ? ` · último teste: ${detail}` : ''}
        </p>
      </div>
      <div className="row">
        <button type="button" className="btn small" onClick={test} disabled={testing} title="Manda um pedido curto ao agente (gasta um pedido da conta dele)">{testing ? 'Testando…' : 'Testar'}</button>
        {agent.source !== 'env' && <button type="button" className="btn small" onClick={() => setEditing(true)}>Editar</button>}
        {agent.source !== 'env' && <button type="button" className="btn small" onClick={async () => { await api.removeCodeAgent(agent.id); onChanged(); }}>Remover</button>}
      </div>
    </div>
  );
}
