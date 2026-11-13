import type { Playbook } from '@orbi/contracts';
import { api } from '../../api';
import { useLive } from '../../hooks';
import { groupLearnings, learningWhen, OUTCOME_LABEL } from './learnings';

/**
 * What was already tried in a procedure (docs/funcionalidades/25), by step: what failed, what
 * worked, what you denied, what was a workaround for a defect of the Orbi. The Orbi reads it when
 * it runs the procedure and before it proposes a change. Tirar removes one that no longer holds.
 */
export function PlaybookLearnings({ p }: { p: Playbook }) {
  const learnings = useLive(() => api.stepLearnings(p.name), ['brain'], [p.name]);
  if (!learnings.data?.length) return null;
  return (
    <section className="pb-learnings small" aria-label="Aprendizados">
      <strong>Aprendizados · {learnings.data.length}</strong>
      <p className="muted">O que já foi tentado aqui. O Orbi lê antes de executar e antes de propor uma mudança.</p>
      {groupLearnings(learnings.data, p.steps).map((g) => (
        <div key={g.step ?? '-'} className="pb-learning-step">
          <span className="ui-kicker">{g.title}</span>
          <ul>
            {g.items.map((l) => (
              <li key={l.id}>
                <span className="pb-learning-text">
                  {l.tried}
                  {l.why && <span className="muted block">{l.why}</span>}
                  <span className="muted block">{learningWhen(l)}</span>
                </span>
                <span className={`pill learn-${l.outcome}`}>{OUTCOME_LABEL[l.outcome]}</span>
                <button type="button" className="btn small" onClick={() => void api.removeStepLearning(l.id)} aria-label={`Tirar o aprendizado: ${l.tried.slice(0, 60)}`}>Tirar</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
