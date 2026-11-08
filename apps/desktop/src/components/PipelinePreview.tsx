import type { PipelineDef } from '../views/pipelines/model';

/** An esteira about to be stored: stages in order, branches, and whether each passage asks. */
export function PipelinePreview({ p }: { p: PipelineDef }) {
  return (
    <div className="learn-pb">
      <div className="learn-pb-head"><span className="ui-kicker">Esteira</span> <strong>{p.name}</strong></div>
      {p.description && <p className="small">{p.description}</p>}
      {p.inputs?.length > 0 && (
        <p className="small muted">Começa com: {p.inputs.map((i) => <code key={i.name}>{i.name}{i.options?.length ? ` (${i.options.join('/')})` : ''}</code>)}</p>
      )}
      <ol className="pl-preview">
        {(p.stages ?? []).map((s, i) => (
          <li key={s.id}>
            {i > 0 && <span className={`pl-pass ${s.passage}`}>{s.passage === 'auto' ? '→ segue sozinho' : '→ pergunta antes'}</span>}
            <strong>{s.label}</strong>{' '}
            {s.options.map((o, j) => (
              <span key={j} className="small">
                {j > 0 && ' · '}
                {o.when && <span className="muted">se {o.when.field} = {o.when.equals}: </span>}
                <code>{o.playbook}</code>
              </span>
            ))}
          </li>
        ))}
      </ol>
      <p className="small muted">Seguir sozinho vale para passar de uma etapa à outra. Ações que pedem aprovação continuam pedindo.</p>
    </div>
  );
}
