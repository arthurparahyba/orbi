import { useState } from 'react';
import type { Pipeline } from '../../api';
import { PipelineDetail } from './PipelineDetail';
import { PipelineEditor } from './PipelineEditor';

/** Minhas esteiras: the list on the left; the chosen one (or the editor) on the right. */
export function MyPipelines({ defs, error, onStarted }: { defs?: Pipeline[]; error?: string; onStarted(conversationId: string): void }) {
  const [open, setOpen] = useState<string>();
  const [editing, setEditing] = useState<Pipeline | 'new'>();
  if (!defs) return <p className="muted pad">{error ? `Erro: ${error}` : 'Carregando…'}</p>;
  const current = defs.find((d) => d.name === open) ?? defs[0];
  return (
    <div className="pl-layout">
      <aside className="pl-list" aria-label="Esteiras">
        <button type="button" className="btn small" onClick={() => setEditing('new')}>+ Nova esteira</button>
        <ul>
          {defs.map((d) => (
            <li key={d.name}>
              <button type="button" className={`pl-item ${current?.name === d.name && !editing ? 'active' : ''}`} onClick={() => { setOpen(d.name); setEditing(undefined); }}>
                <strong>{d.name}</strong>
                <span className="muted small">{d.stages.length} etapas{d.stages.some((s) => s.options.length > 1) ? ' · com ramos' : ''} · usada {d.uses} {d.uses === 1 ? 'vez' : 'vezes'}</span>
              </button>
            </li>
          ))}
        </ul>
        {defs.length === 0 && <p className="muted small">Nenhuma ainda. Crie aqui, ou peça na conversa: "quando o workflow de dev terminar, chama a homologação".</p>}
      </aside>
      <section className="pl-main">
        {editing ? (
          <PipelineEditor initial={editing === 'new' ? undefined : editing} onDone={(name) => { setEditing(undefined); if (name) setOpen(name); }} />
        ) : current ? (
          <PipelineDetail p={current} onEdit={() => setEditing(current)} onStarted={onStarted} />
        ) : null}
      </section>
    </div>
  );
}
