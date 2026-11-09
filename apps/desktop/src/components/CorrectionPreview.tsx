import { correctionView, type Step } from './stepDiff';
import { ScriptsPreview } from './ScriptsPreview';
import type { Script } from './stepDiff';

type Procedure = Parameters<typeof correctionView>[0] & { name: string; scripts?: Script[] };

/** One change, as it is today and as it will be after the correction. */
function BeforeAfter({ before, after }: { before?: string; after?: string }) {
  return (
    <div className="ba">
      <div className="ba-col ba-before"><span className="ba-tag">Hoje</span><p>{before ?? '—'}</p></div>
      <div className="ba-col ba-after"><span className="ba-tag">Depois da correção</span><p>{after ?? '—'}</p></div>
    </div>
  );
}

/**
 * The learning card for a correction of a procedure that exists: only what changes, each with
 * "Hoje" and "Depois da correção". What stays the same is folded into one line.
 */
export function CorrectionPreview({ base, next }: { base: Procedure; next: Procedure }) {
  const { fields, steps, same } = correctionView(base, next);
  const index = new Map((next.steps ?? []).map((s: Step, i: number) => [s.id, i + 1]));
  return (
    <div className="learn-pb correction">
      <div className="learn-pb-head"><span className="ui-kicker">Corrige o procedimento</span> <strong>{base.name}</strong></div>
      <p className="small muted">Só muda o que está abaixo. O resto continua como está.</p>
      {fields.length === 0 && steps.length === 0 && <p className="small">Nenhuma mudança nos passos nem na descrição.</p>}
      {fields.map((f) => (
        <div key={f.label} className="corr-item"><strong className="small">{f.label}</strong><BeforeAfter before={f.before} after={f.after} /></div>
      ))}
      {steps.map(({ step, change, before }) => (
        <div key={`${step.id}-${change}`} className={`corr-item is-${change}`}>
          <strong className="small">
            {change === 'new' ? 'Passo novo' : change === 'removed' ? 'Passo que sai' : `Passo ${index.get(step.id) ?? ''}`}: {change === 'changed' && before && before.label !== step.label ? `${before.label} → ${step.label}` : step.label}
          </strong>
          {change === 'changed' && <BeforeAfter before={before?.how} after={step.how} />}
          {change === 'new' && <BeforeAfter before="(não existe)" after={step.how} />}
          {change === 'removed' && <BeforeAfter before={step.how} after="(sai do procedimento)" />}
        </div>
      ))}
      {same.length > 0 && (
        <details className="small muted corr-same">
          <summary>{same.length === 1 ? '1 passo continua igual' : `${same.length} passos continuam iguais`}</summary>
          <ul>{same.map((s) => <li key={s.id}>{s.label}</li>)}</ul>
        </details>
      )}
      <ScriptsPreview base={base.scripts} next={next.scripts} hasBase />
    </div>
  );
}
