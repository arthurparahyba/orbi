import { correctionView, rewritten, trimSame, wordDiff, type Step } from './stepDiff';
import { ScriptsPreview } from './ScriptsPreview';
import type { Script } from './stepDiff';

type Procedure = Parameters<typeof correctionView>[0] & { name: string; scripts?: Script[] };

/**
 * One change, merged as in a code review: what enters highlighted, what leaves struck through,
 * long unchanged stretches cut to "…". A text rewritten almost entirely shows the new one, with
 * the old one a click away.
 */
function Merged({ before, after }: { before?: string; after?: string }) {
  const pieces = wordDiff(before ?? '', after ?? '');
  if (before && after && rewritten(pieces) > 0.7) {
    return (
      <div className="merged">
        <p><span className="m-tag">reescrito</span> <ins>{after}</ins></p>
        <details className="small muted"><summary>Como era</summary><p><del>{before}</del></p></details>
      </div>
    );
  }
  return (
    <p className="merged">
      {trimSame(pieces).map((piece, i) => (piece.kind === 'add' ? <ins key={i}>{piece.text}</ins> : piece.kind === 'del' ? <del key={i}>{piece.text}</del> : <span key={i}>{piece.text}</span>))}
    </p>
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
      <p className="small muted">Só muda o que está abaixo, <ins>o que entra</ins> e <del>o que sai</del>. O resto continua como está.</p>
      {fields.length === 0 && steps.length === 0 && <p className="small">Nenhuma mudança nos passos nem na descrição.</p>}
      {fields.map((f) => (
        <div key={f.label} className="corr-item"><strong className="small">{f.label}</strong><Merged before={f.before === '(vazio)' ? '' : f.before} after={f.after === '(vazio)' ? '' : f.after} /></div>
      ))}
      {steps.map(({ step, change, before }) => (
        <div key={`${step.id}-${change}`} className={`corr-item is-${change}`}>
          <strong className="small">
            {change === 'new' ? 'Passo novo' : change === 'removed' ? 'Passo que sai' : `Passo ${index.get(step.id) ?? ''}`}: {change === 'changed' && before && before.label !== step.label ? <Merged before={before.label} after={step.label} /> : step.label}
          </strong>
          {change === 'changed' && (before?.how ?? '') !== (step.how ?? '') && <Merged before={before?.how} after={step.how} />}
          {change === 'new' && <p className="merged"><ins>{step.how}</ins></p>}
          {change === 'removed' && <p className="merged"><del>{step.how}</del></p>}
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
