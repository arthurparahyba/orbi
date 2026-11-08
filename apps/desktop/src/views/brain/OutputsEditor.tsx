import { PlusIcon, TrashIcon } from '../../components/Icons';
import type { EditableOutput } from './editing';

/** The data a procedure hands over: a name (pr_url) and what it is. */
export function OutputsEditor({ outputs, onChange }: { outputs: EditableOutput[]; onChange(next: EditableOutput[]): void }) {
  const set = (i: number, change: Partial<EditableOutput>) => onChange(outputs.map((o, j) => (j === i ? { ...o, ...change } : o)));
  return (
    <fieldset className="outputs-editor">
      <legend>Entrega <span className="muted small">o que fica registrado ao terminar, para a próxima etapa de uma esteira</span></legend>
      {outputs.map((o, i) => (
        <div key={i} className="row gap8">
          <label className="sr-only" htmlFor={`out-n-${i}`}>Nome do dado {i + 1}</label>
          <input id={`out-n-${i}`} className="mono" value={o.name} placeholder="pr_url" onChange={(e) => set(i, { name: e.target.value })} />
          <label className="sr-only" htmlFor={`out-d-${i}`}>O que é o dado {i + 1}</label>
          <input id={`out-d-${i}`} value={o.description} placeholder="PR aberto para a develop" onChange={(e) => set(i, { description: e.target.value })} />
          <button type="button" className="icon-btn" aria-label={`Tirar o dado ${i + 1}`} onClick={() => onChange(outputs.filter((_, j) => j !== i))}><TrashIcon size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...outputs, { name: '', description: '' }])}><PlusIcon size={13} /> Dado</button>
    </fieldset>
  );
}
