import { useState } from 'react';
import { api } from '../../../api';
import { useLive } from '../../../hooks';
import { TaskPicker } from './TaskPicker';
import { AgentRow } from './AgentRow';
import { AgentEditor } from './AgentEditor';
import { notRegistered, usedFor } from './model';

const BLANK = { id: '', name: '', command: '', models: [] as string[] };

/** Autonomia › Agentes de código, left column: who investigates and fixes, with which model, and how each is called. */
export function CodeAgents() {
  const state = useLive(api.codeAgents, ['code-agents']);
  const [adding, setAdding] = useState<typeof BLANK & { source?: 'catalogo' | 'manual' }>();
  const reload = () => void state.reload();
  const s = state.data;
  return (
    <>
      <section className="auto-list" aria-labelledby="ca-tasks">
        <h2 id="ca-tasks">Quem faz o quê</h2>
        {!s && <div className="auto-row muted">{state.error ? `Erro: ${state.error}` : 'Carregando…'}</div>}
        {s && <TaskPicker state={s} onChanged={reload} />}
      </section>
      <section className="auto-list" aria-labelledby="ca-machine">
        <h2 id="ca-machine">Nesta máquina</h2>
        {s?.agents.length === 0 && <div className="auto-row muted">Nenhum agente cadastrado. Peça ao Orbi no chat à direita para procurar, ou comece por um conhecido abaixo.</div>}
        {s?.agents.map((a) => <AgentRow key={a.id} agent={a} usedFor={usedFor(s, a.id)} onChanged={reload} />)}
        {adding ? (
          <div className="auto-row"><AgentEditor isNew initial={adding} onDone={(saved) => { setAdding(undefined); if (saved) reload(); }} /></div>
        ) : (
          <div className="auto-row row ca-add">
            {s && notRegistered(s).map((c) => (
              <button key={c.id} type="button" className="btn small" title={c.note} onClick={() => setAdding({ ...c, source: 'catalogo' })}>Adicionar {c.name}</button>
            ))}
            <button type="button" className="btn small" onClick={() => setAdding({ ...BLANK, source: 'manual' })}>Outro agente</button>
          </div>
        )}
      </section>
    </>
  );
}
