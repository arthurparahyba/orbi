import type { ExecutionReview } from '@orbi/contracts';
import { CheckIcon, AlertIcon } from './Icons';
import { LevelCard } from './LevelCard';

/**
 * The review at the end of an execution, as the runtime found it (signal `review`): each
 * procedure with "sem problemas" or what went wrong, its level change, and the esteira's
 * configuration problems. The Orbi's proposed fixes come right after, as a learning card.
 */
export function ReviewCard({ r }: { r: ExecutionReview }) {
  const problems = r.runs.some((x) => x.problems.length) || r.config.length > 0;
  return (
    <section className={`ui-card review-card ${problems ? 'has-problems' : 'is-clean'}`} aria-label="Revisão da execução">
      <header className="ui-card-head">
        <span className={`ui-icon ${problems ? 'warn' : 'ok'}`}>{problems ? <AlertIcon size={14} /> : <CheckIcon size={14} />}</span>
        <strong>Revisão da execução</strong>
        {r.pipeline && <span className="muted small">esteira {r.pipeline}</span>}
      </header>
      <ul className="review-runs">
        {r.runs.map((x) => (
          <li key={x.runId}>
            <span className={`review-mark ${x.problems.length ? 'is-bad' : 'is-ok'}`} aria-hidden="true">{x.problems.length ? '!' : '✓'}</span>
            <span className="review-body">
              <strong>{x.playbook}</strong>
              {x.problems.length === 0 ? <span className="muted small"> sem problemas</span> : <ul className="small">{x.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            </span>
          </li>
        ))}
      </ul>
      {r.config.length > 0 && (
        <div className="review-config small">
          <strong>Configuração</strong>
          <ul>{r.config.map((c, i) => <li key={i}><span className="muted">{c.stage}:</span> {c.text}</li>)}</ul>
        </div>
      )}
      {problems && <p className="muted small">O Orbi propõe as correções logo abaixo; nada muda sem você aprovar.</p>}
      {r.runs.filter((x) => x.level).map((x) => (
        <LevelCard key={`l-${x.runId}`} c={{ component: 'level', id: `level-${x.runId}`, playbook: x.playbook, ...x.level! }} />
      ))}
    </section>
  );
}

/** The review carried by a signal's attributes, if it is one. */
export function reviewOf(attributes: Record<string, unknown> | undefined): ExecutionReview | undefined {
  const raw = attributes?.review;
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw) as ExecutionReview;
  } catch {
    return undefined;
  }
}
