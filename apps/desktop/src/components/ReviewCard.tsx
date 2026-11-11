import type { ExecutionReview } from '@orbi/contracts';
import { CheckIcon, AlertIcon } from './Icons';
import { LevelCard } from './LevelCard';
import { FINDING_SECTIONS, findingsOf } from './review';
import { FixEnvironment } from './review/FixEnvironment';
import { changeLine, ideasLine } from './review/reviewLines';

export { reviewOf } from './review';

/**
 * The review at the end of an execution, as the runtime found it (signal `review`): each
 * procedure with "sem problemas" or what went wrong, its level change, and the esteira's
 * configuration problems. The Orbi's proposed fixes come right after, as a learning card.
 */
export function ReviewCard({ r }: { r: ExecutionReview }) {
  const problems = r.runs.some((x) => findingsOf(x, 'problema').length) || r.config.length > 0;
  const others = FINDING_SECTIONS.map((s) => ({ ...s, items: r.runs.flatMap((x) => findingsOf(x, s.kind).map((text) => ({ run: x, text }))) })).filter((s) => s.items.length);
  return (
    <section className={`ui-card review-card ${problems ? 'has-problems' : 'is-clean'}`} aria-label="Revisão da execução">
      <header className="ui-card-head">
        <span className={`ui-icon ${problems ? 'warn' : 'ok'}`}>{problems ? <AlertIcon size={14} /> : <CheckIcon size={14} />}</span>
        <strong>Revisão da execução</strong>
        {r.pipeline && <span className="muted small">esteira {r.pipeline}</span>}
      </header>
      <ul className="review-runs">
        {r.runs.map((x) => {
          const bad = findingsOf(x, 'problema');
          return (
            <li key={x.runId}>
              <span className={`review-mark ${bad.length ? 'is-bad' : 'is-ok'}`} aria-hidden="true">{bad.length ? '!' : '✓'}</span>
              <span className="review-body">
                <strong>{x.playbook}</strong>
                {bad.length === 0 ? <span className="muted small"> sem problemas</span> : <ul className="small">{bad.map((p) => <li key={p}>{p}</li>)}</ul>}
              </span>
            </li>
          );
        })}
      </ul>
      {r.config.length > 0 && (
        <div className="review-config small">
          <strong>Configuração</strong>
          <ul>{r.config.map((c, i) => <li key={i}><span className="muted">{c.stage}:</span> {c.text}</li>)}</ul>
        </div>
      )}
      {others.map((sec) => (
        <div key={sec.kind} className="review-config small">
          <strong>{sec.title}</strong>
          <ul>{sec.items.map(({ run, text }) => <li key={`${run.runId}-${text}`}><span className="muted">{run.playbook}:</span> {text}</li>)}</ul>
        </div>
      ))}
      {(r.change?.length ?? 0) > 0 && (
        <div className="review-config small">
          <strong>Vale mudar</strong>
          <ul>{r.change!.map((c) => <li key={c.playbook}>{changeLine(c)}</li>)}</ul>
        </div>
      )}
      {r.environment?.map((e) => <FixEnvironment key={e.noteId} e={e} />)}
      {ideasLine(r.ideas) && <p className="muted small">{ideasLine(r.ideas)}</p>}
      {((r.change?.length ?? 0) > 0 || others.some((s) => s.kind === 'aprender')) && <p className="muted small">O Orbi propõe logo abaixo; nada muda sem você aprovar.</p>}
      {r.runs.filter((x) => x.level).map((x) => (
        <LevelCard key={`l-${x.runId}`} c={{ component: 'level', id: `level-${x.runId}`, playbook: x.playbook, ...x.level! }} />
      ))}
    </section>
  );
}
