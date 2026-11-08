import { useState } from 'react';
import { api, type Pipeline } from '../../api';
import { useLive } from '../../hooks';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { StageCard } from './StageCard';
import { StartForm } from './StartForm';

/** One esteira: what it starts with, its stages in order, and how each passage goes. */
export function PipelineDetail({ p, onEdit, onStarted }: { p: Pipeline; onEdit(): void; onStarted(conversationId: string): void }) {
  const playbooks = useLive(api.playbooks, ['brain']);
  const [mode, setMode] = useState<'start' | 'delete'>();
  return (
    <div className="pl-detail">
      <header className="row gap8">
        <div className="spacer">
          <h2>{p.name}</h2>
          {p.description && <p className="muted">{p.description}</p>}
          {p.inputs.length > 0 && (
            <p className="small">Começa com: {p.inputs.map((i) => <code key={i.name} title={i.description}>{i.name}{i.options?.length ? ` (${i.options.join(' / ')})` : ''}{i.default ? ` = ${i.default}` : ''}</code>)}</p>
          )}
        </div>
        <button type="button" className="btn small" onClick={onEdit}>Editar</button>
        <button type="button" className="btn small" onClick={() => setMode(mode === 'delete' ? undefined : 'delete')}>Apagar</button>
        <button type="button" className="btn small primary" onClick={() => setMode(mode === 'start' ? undefined : 'start')}>Começar uma entrega</button>
      </header>
      {mode === 'delete' && (
        <ConfirmDelete
          what={`a esteira ${p.name}`}
          consequences={['Os procedimentos continuam no Cérebro.', 'Entregas já feitas continuam em Em andamento.']}
          onConfirm={async () => { await api.deletePipeline(p.name); setMode(undefined); }}
          onCancel={() => setMode(undefined)}
        />
      )}
      {mode === 'start' && <StartForm p={p} onStarted={onStarted} onCancel={() => setMode(undefined)} />}
      <ol className="pl-stages">
        {p.stages.map((s, i) => (
          <li key={s.id}>
            {i > 0 && (
              <p className="pl-passage small">
                <span aria-hidden="true">↓</span> quando {p.stages[i - 1].label} terminar bem,{' '}
                <span className={`pl-pass ${s.passage}`}>{s.passage === 'auto' ? 'segue sozinho' : 'pergunta antes de seguir'}</span>
              </p>
            )}
            <StageCard stage={s} index={i} playbooks={playbooks.data ?? []} gaps={(p.gaps ?? []).filter((g) => g.stage === s.id)} />
          </li>
        ))}
      </ol>
      {(p.gaps ?? []).length > 0 && (
        <p className="small warn-text">
          {p.gaps!.map((g) => `${g.param} (${g.playbook})`).join(', ')}: nenhuma etapa entrega. O Orbi pergunta quando chegar lá, ou ligue em Editar.
        </p>
      )}
    </div>
  );
}
