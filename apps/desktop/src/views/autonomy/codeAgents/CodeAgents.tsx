import { useState } from 'react';
import { api } from '../../../api';
import { useLive } from '../../../hooks';
import { TaskPicker } from './TaskPicker';
import { AgentRow } from './AgentRow';
import { AgentEditor } from './AgentEditor';
import { notRegistered, usedFor } from './model';

const BLANK = { id: '', name: '', command: '', models: [] as string[] };

/** Autonomia › Agentes de código: who investigates and fixes, with which model, and how each is called. */
export function CodeAgents({ side }: { side?: React.ReactNode }) {
  const state = useLive(api.codeAgents, ['code-agents']);
  const [adding, setAdding] = useState<typeof BLANK & { source?: 'catalogo' | 'manual' }>();
  const reload = () => void state.reload();
  const s = state.data;
  return (
    <section className="auto-list code-agents" aria-labelledby="ca-title">
      <h2 id="ca-title">Agentes de código</h2>
      <p className="muted small pad-x16">Quando uma esteira ou um procedimento quebra por causa de código, o Orbi pede a um destes agentes para investigar ou corrigir, numa cópia descartável do repositório. Ele nunca faz commit nem vê credenciais: quem aplica é o Orbi, pelas regras de autonomia.</p>
      <div className="ca-layout">
        <div className="ca-main">
          {!s && <div className="auto-row muted">{state.error ? `Erro: ${state.error}` : 'Carregando…'}</div>}
          {s && <TaskPicker state={s} onChanged={reload} />}
          <h3 className="pad-x16">Nesta máquina</h3>
          {s?.agents.length === 0 && <div className="auto-row muted">Nenhum agente cadastrado. Peça ao Orbi ao lado para procurar, ou comece por um conhecido abaixo.</div>}
          {s?.agents.map((a) => <AgentRow key={a.id} agent={a} usedFor={usedFor(s, a.id)} onChanged={reload} />)}
          {adding ? (
            <div className="auto-row"><AgentEditor isNew initial={adding} onDone={(saved) => { setAdding(undefined); if (saved) reload(); }} /></div>
          ) : (
            <div className="auto-row row">
              {s && notRegistered(s).map((c) => (
                <button key={c.id} type="button" className="btn small" title={c.note} onClick={() => setAdding({ ...c, source: 'catalogo' })}>Adicionar {c.name}</button>
              ))}
              <button type="button" className="btn small" onClick={() => setAdding({ ...BLANK, source: 'manual' })}>Outro agente</button>
            </div>
          )}
        </div>
        {side && <div className="ca-side">{side}</div>}
      </div>
    </section>
  );
}
