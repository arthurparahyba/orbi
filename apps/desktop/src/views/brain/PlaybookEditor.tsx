import { useState } from 'react';
import { api, type Playbook } from '../../api';
import { DownIcon, PlusIcon, TrashIcon, UpIcon } from '../../components/Icons';
import { finalizeSteps, moveStep, stepProblems, type EditableStep } from './editing';

/**
 * Edit a playbook: when to use it, its steps (rename, reorder, add, remove) and
 * instructions. Name, autonomy and base stay; existing steps keep their ids.
 */
export function PlaybookEditor({ playbook, onDone }: { playbook: Playbook; onDone(saved: boolean): void }) {
  const [description, setDescription] = useState(playbook.description);
  const [trigger, setTrigger] = useState(playbook.trigger);
  const [appliesTo, setAppliesTo] = useState(playbook.appliesTo ?? '');
  const [steps, setSteps] = useState<EditableStep[]>(() => playbook.steps.map((s) => ({ ...s })));
  const [instructions, setInstructions] = useState(playbook.instructions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const problems = stepProblems(steps);

  const setStep = (i: number, change: Partial<EditableStep>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const save = async () => {
    if (problems.length) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.editPlaybook(playbook.name, {
        description: description.trim(),
        trigger: trigger.trim(),
        appliesTo: appliesTo.trim() || null,
        steps: finalizeSteps(steps),
        instructions,
      });
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form className="edit-form" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={`Editar ${playbook.name}`}>
      <label className="field" htmlFor="pb-desc">Para que serve (é por aqui que o Orbi acha o procedimento)
        <input id="pb-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="two-cols">
        <label className="field" htmlFor="pb-trigger">Quando usar
          <input id="pb-trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
        </label>
        <label className="field" htmlFor="pb-applies">Vale para (classe, opcional)
          <input id="pb-applies" value={appliesTo} placeholder="ex.: MicroFrontend" onChange={(e) => setAppliesTo(e.target.value)} />
        </label>
      </div>

      <h3>Passos</h3>
      <ol className="step-editor">
        {steps.map((s, i) => (
          <li key={s.id || `novo-${i}`}>
            <span className="step-dot">{i + 1}</span>
            <div className="step-fields">
              <label className="sr-only" htmlFor={`st-l-${i}`}>Nome do passo {i + 1}</label>
              <input id={`st-l-${i}`} value={s.label} placeholder="Nome do passo" onChange={(e) => setStep(i, { label: e.target.value })} />
              <label className="sr-only" htmlFor={`st-h-${i}`}>Como fazer o passo {i + 1}</label>
              <textarea id={`st-h-${i}`} rows={2} value={s.how} placeholder="Como: ferramenta e como saber que deu certo" onChange={(e) => setStep(i, { how: e.target.value })} />
            </div>
            <div className="step-actions">
              <button type="button" className="icon-btn" aria-label={`Subir o passo ${i + 1}`} disabled={i === 0} onClick={() => setSteps((all) => moveStep(all, i, -1))}><UpIcon size={14} /></button>
              <button type="button" className="icon-btn" aria-label={`Descer o passo ${i + 1}`} disabled={i === steps.length - 1} onClick={() => setSteps((all) => moveStep(all, i, 1))}><DownIcon size={14} /></button>
              <button type="button" className="icon-btn" aria-label={`Tirar o passo ${i + 1}`} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}><TrashIcon size={14} /></button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn small" onClick={() => setSteps((all) => [...all, { id: '', label: '', how: '' }])}><PlusIcon size={13} /> Passo</button>

      <label className="field" htmlFor="pb-instr">Instruções gerais
        <textarea id="pb-instr" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </label>
      <p className="muted small">Use <code>{'{{nome}}'}</code> para o que muda a cada vez e <code>{'{{segredo:…}}'}</code> para credenciais do cofre. O nome, a autonomia e a base não mudam aqui.</p>
      {(error || problems.length > 0) && <p className="form-error" role="alert">{error ?? problems.join(' ')}</p>}
      <div className="row gap">
        <button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Salvar</button>
        <button type="button" className="btn" disabled={busy} onClick={() => onDone(false)}>Cancelar</button>
      </div>
    </form>
  );
}
