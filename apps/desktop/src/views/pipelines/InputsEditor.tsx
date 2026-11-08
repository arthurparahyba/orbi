import { PlusIcon, TrashIcon } from '../../components/Icons';
import type { PipelineInput } from '../../api';

/** What the esteira asks to start (repo; tipo with options front, backend). */
export function InputsEditor({ inputs, onChange }: { inputs: PipelineInput[]; onChange(next: PipelineInput[]): void }) {
  const set = (i: number, change: Partial<PipelineInput>) => onChange(inputs.map((x, j) => (j === i ? { ...x, ...change } : x)));
  return (
    <fieldset className="outputs-editor">
      <legend>Começa com <span className="muted small">o que você informa ao começar uma entrega; com padrão, o Orbi não pergunta</span></legend>
      {inputs.map((x, i) => (
        <div key={i} className="row gap8">
          <label className="sr-only" htmlFor={`in-n-${i}`}>Nome da entrada {i + 1}</label>
          <input id={`in-n-${i}`} className="mono" value={x.name} placeholder="repo" onChange={(e) => set(i, { name: e.target.value })} />
          <label className="sr-only" htmlFor={`in-d-${i}`}>O que é a entrada {i + 1}</label>
          <input id={`in-d-${i}`} value={x.description} placeholder="repositório no GitHub" onChange={(e) => set(i, { description: e.target.value })} />
          <label className="sr-only" htmlFor={`in-o-${i}`}>Opções da entrada {i + 1}</label>
          <input id={`in-o-${i}`} value={(x.options ?? []).join(', ')} placeholder="opções (ex.: front, backend)"
            onChange={(e) => set(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
          <label className="sr-only" htmlFor={`in-p-${i}`}>Padrão da entrada {i + 1}</label>
          <input id={`in-p-${i}`} className="mono" value={x.default ?? ''} placeholder="padrão (opcional)" title="Com padrão, o Orbi começa sem perguntar"
            onChange={(e) => set(i, { default: e.target.value || undefined })} />
          <button type="button" className="icon-btn" aria-label={`Tirar a entrada ${i + 1}`} onClick={() => onChange(inputs.filter((_, j) => j !== i))}><TrashIcon size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...inputs, { name: '', description: '' }])}><PlusIcon size={13} /> Entrada</button>
    </fieldset>
  );
}
