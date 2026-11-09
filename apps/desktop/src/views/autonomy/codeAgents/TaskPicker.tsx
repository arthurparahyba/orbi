import { api, type CodeAgentsState } from '../../../api';
import { TASKS, modelOptions } from './model';

/** Which agent and model does each task. */
export function TaskPicker({ state, onChanged }: { state: CodeAgentsState; onChanged(): void }) {
  const assign = async (task: (typeof TASKS)[number]['task'], agent: string | null, model: string | null) => {
    await api.assignCodeAgent(task, agent, model);
    onChanged();
  };
  return (
    <div className="ca-tasks">
      {TASKS.map(({ task, title, hint }) => {
        const current = state.tasks.find((t) => t.task === task);
        const agent = state.agents.find((a) => a.id === current?.agent);
        const models = modelOptions(agent, current?.model ?? null);
        return (
          <div key={task} className="auto-row">
            <div>
              <strong>{title}</strong>
              <p className="muted small">{hint}</p>
            </div>
            <div className="row">
              <label className="sr-only" htmlFor={`ca-${task}`}>Agente para {task}</label>
              <select id={`ca-${task}`} value={current?.agent ?? ''} onChange={(e) => void assign(task, e.target.value || null, null)}>
                <option value="">Nenhum</option>
                {state.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label className="sr-only" htmlFor={`cm-${task}`}>Modelo para {task}</label>
              <select id={`cm-${task}`} value={current?.model ?? ''} disabled={!agent || models.length === 0}
                onChange={(e) => void assign(task, current!.agent, e.target.value || null)}>
                <option value="">{models.length ? 'Padrão do agente' : 'Modelo padrão'}</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
