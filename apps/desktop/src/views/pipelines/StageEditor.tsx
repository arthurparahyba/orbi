import type { PipelineOption, PipelineStage, Playbook } from '../../api';
import { DownIcon, PlusIcon, TrashIcon, UpIcon } from '../../components/Icons';
import { Segmented } from '../../components/Segmented';
import { paramsOf, sourcesFor, type PipelineDef } from './model';

/** One stage in the editor: name, passage, procedure per branch, and where each parameter comes from. */
export function StageEditor({ def, index, playbooks, onChange, onMove }: {
  def: PipelineDef; index: number; playbooks: Playbook[]; onChange(s: PipelineStage | null): void; onMove(delta: -1 | 1): void;
}) {
  const s = def.stages[index];
  const setOption = (j: number, change: Partial<PipelineOption>) => onChange({ ...s, options: s.options.map((o, k) => (k === j ? { ...o, ...change } : o)) });
  const sources = sourcesFor(def, index, playbooks);
  const fields = sources.filter((x) => x.value.startsWith('entrada.') || x.value.includes('.')).map((x) => x.value.split('.')[1]);
  return (
    <li className="pl-stage-edit">
      <div className="row gap8">
        <span className="step-dot">{index + 1}</span>
        <label className="sr-only" htmlFor={`st-${index}`}>Nome da etapa {index + 1}</label>
        <input id={`st-${index}`} className="spacer" value={s.label} placeholder="Homologação" onChange={(e) => onChange({ ...s, label: e.target.value })} />
        {index > 0 && (
          <Segmented<'ask' | 'auto'> label={`Passagem para a etapa ${index + 1}`} value={s.passage}
            options={[{ value: 'ask', label: 'pergunta' }, { value: 'auto', label: 'segue' }]} onChange={(passage) => onChange({ ...s, passage })} />
        )}
        <button type="button" className="icon-btn" aria-label={`Subir a etapa ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)}><UpIcon size={14} /></button>
        <button type="button" className="icon-btn" aria-label={`Descer a etapa ${index + 1}`} disabled={index === def.stages.length - 1} onClick={() => onMove(1)}><DownIcon size={14} /></button>
        <button type="button" className="icon-btn" aria-label={`Tirar a etapa ${index + 1}`} onClick={() => onChange(null)}><TrashIcon size={14} /></button>
      </div>
      {s.options.map((o, j) => {
        const pb = playbooks.find((p) => p.name === o.playbook);
        return (
          <div key={j} className="pl-option-edit">
            {s.options.length > 1 && (
              <span className="row gap8 small">
                se
                <select aria-label="Campo da condição" value={o.when?.field ?? ''} onChange={(e) => setOption(j, { when: { field: e.target.value, equals: o.when?.equals ?? '' } })}>
                  <option value="">escolha</option>
                  {[...new Set(fields)].map((f) => <option key={f}>{f}</option>)}
                </select>
                =
                <input aria-label="Valor da condição" value={o.when?.equals ?? ''} onChange={(e) => setOption(j, { when: { field: o.when?.field ?? '', equals: e.target.value } })} />
              </span>
            )}
            <select aria-label={`Procedimento da etapa ${index + 1}`} value={o.playbook} onChange={(e) => setOption(j, { playbook: e.target.value, map: {} })}>
              <option value="">escolha o procedimento</option>
              {playbooks.map((p) => <option key={p.name}>{p.name}</option>)}
            </select>
            {paramsOf(pb).map((param) => (
              <label key={param} className="small row gap8">
                <code>{param}</code> ←
                <select value={o.map?.[param] ?? ''} onChange={(e) => {
                  const map = { ...(o.map ?? {}) };
                  if (e.target.value) map[param] = e.target.value; else delete map[param];
                  setOption(j, { map });
                }}>
                  {sources.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </label>
            ))}
            {s.options.length > 1 && (
              <button type="button" className="link-btn small" onClick={() => onChange({ ...s, options: s.options.filter((_, k) => k !== j) })}>tirar este caminho</button>
            )}
          </div>
        );
      })}
      <button type="button" className="link-btn small" onClick={() => onChange({ ...s, options: [...s.options, { playbook: '', when: { field: '', equals: '' } }] })}>
        <PlusIcon size={12} /> outro caminho (ramo)
      </button>
    </li>
  );
}
