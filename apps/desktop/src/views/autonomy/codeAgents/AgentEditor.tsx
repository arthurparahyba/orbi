import { useState } from 'react';
import { api, type SaveCodeAgent } from '../../../api';
import { parseModels } from './model';

type Draft = { id: string; name: string; command: string; models: string[]; source?: SaveCodeAgent['source']; runIn?: 'window' | 'background' };

/** Register or change one agent: its one-shot command and the models it accepts. */
export function AgentEditor({ initial, isNew, onDone }: { initial: Draft; isNew: boolean; onDone(saved: boolean): void }) {
  const [id, setId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [command, setCommand] = useState(initial.command);
  const [models, setModels] = useState(initial.models.join(', '));
  const [runIn, setRunIn] = useState<'window' | 'background'>(initial.runIn ?? 'window');
  const [error, setError] = useState<string>();
  const save = async () => {
    try {
      await api.saveCodeAgent(id.trim(), { name, command, models: parseModels(models), source: initial.source ?? 'manual', runIn });
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <form className="ca-editor" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {isNew && (
        <label>Identificador<input value={id} onChange={(e) => setId(e.target.value)} placeholder="claude-code" required /></label>
      )}
      <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>Comando de uso único
        <input className="mono" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="claude -p --model {modelo} -- {prompt}" required />
      </label>
      <p className="muted small">{'{prompt}'} é onde entra o pedido (sem ele, vai no fim); {'{modelo}'}, o modelo da tarefa. Roda dentro de uma cópia do repositório.</p>
      <label>Onde roda
        <select value={runIn} onChange={(e) => setRunIn(e.target.value as 'window' | 'background')}>
          <option value="window">Numa janela do terminal: você acompanha, e ele usa o seu login como no terminal</option>
          <option value="background">Em segundo plano, sem janela</option>
        </select>
      </label>
      <label>Modelos que ele aceita (separados por vírgula)<input value={models} onChange={(e) => setModels(e.target.value)} placeholder="vazio: usa o padrão do agente" /></label>
      {error && <p className="banner small" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="btn small primary">Salvar</button>
        <button type="button" className="btn small" onClick={() => onDone(false)}>Cancelar</button>
      </div>
    </form>
  );
}
