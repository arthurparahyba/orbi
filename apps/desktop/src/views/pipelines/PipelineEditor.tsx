import { useState } from 'react';
import { api, type Pipeline, type PipelineStage } from '../../api';
import { useLive } from '../../hooks';
import { PlusIcon } from '../../components/Icons';
import { draftProblems, stageIdFrom, type PipelineDef } from './model';
import { InputsEditor } from './InputsEditor';
import { StageEditor } from './StageEditor';

/** Create or change an esteira: what it starts with, its stages, branches, passages and data. */
export function PipelineEditor({ initial, onDone }: { initial?: Pipeline; onDone(name?: string): void }) {
  const playbooks = useLive(api.playbooks, ['brain']);
  const [def, setDef] = useState<PipelineDef>(() =>
    initial ? structuredClone({ name: initial.name, description: initial.description, inputs: initial.inputs, stages: initial.stages }) : { name: '', description: '', inputs: [], stages: [] },
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const problems = draftProblems(def);
  const setStage = (i: number, s: PipelineStage | null) =>
    setDef((d) => ({ ...d, stages: s ? d.stages.map((x, j) => (j === i ? s : x)) : d.stages.filter((_, j) => j !== i) }));
  const move = (i: number, delta: -1 | 1) =>
    setDef((d) => {
      const stages = [...d.stages];
      [stages[i], stages[i + delta]] = [stages[i + delta], stages[i]];
      return { ...d, stages };
    });
  const add = () => setDef((d) => ({ ...d, stages: [...d.stages, { id: '', label: '', passage: d.stages.length ? 'ask' : 'auto', options: [{ playbook: '' }] }] }));

  const save = async () => {
    const taken: string[] = [];
    const stages = def.stages.map((s) => {
      const id = s.id || stageIdFrom(s.label, taken);
      taken.push(id);
      return { ...s, id, label: s.label.trim() };
    });
    setBusy(true);
    setError(undefined);
    try {
      await api.savePipeline(def.name, { description: def.description.trim(), inputs: def.inputs.filter((i) => i.name.trim()), stages });
      onDone(def.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form className="edit-form pl-editor" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={initial ? `Editar ${initial.name}` : 'Nova esteira'}>
      <div className="two-cols">
        <label className="field">Nome
          <input value={def.name} disabled={!!initial} placeholder="entrega-do-portal" onChange={(e) => setDef({ ...def, name: e.target.value })} />
        </label>
        <label className="field">Para que serve
          <input value={def.description} onChange={(e) => setDef({ ...def, description: e.target.value })} />
        </label>
      </div>
      <InputsEditor inputs={def.inputs} onChange={(inputs) => setDef({ ...def, inputs })} />
      <h3>Etapas</h3>
      <ol className="pl-stage-editor">
        {def.stages.map((s, i) => (
          <StageEditor key={i} def={def} index={i} playbooks={playbooks.data ?? []} onChange={(x) => setStage(i, x)} onMove={(d) => move(i, d)} />
        ))}
      </ol>
      <button type="button" className="btn small" onClick={add}><PlusIcon size={13} /> Etapa</button>
      {(error || problems.length > 0) && <p className="form-error" role="alert">{error ?? problems.join(' ')}</p>}
      <div className="row gap8">
        <button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Salvar</button>
        <button type="button" className="btn" disabled={busy} onClick={() => onDone()}>Cancelar</button>
      </div>
    </form>
  );
}
