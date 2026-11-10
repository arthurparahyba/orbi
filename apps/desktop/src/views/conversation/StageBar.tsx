import type { ConversationState } from '../../api';
import { CheckIcon } from '../../components/Icons';
import { STAGES, stageIndex } from './stage';

/** Where the teaching is: Explicar · Ensaiar · Combinar · Aprender · Assumir. Hidden while doing something known. */
export function StageBar({ state }: { state: ConversationState }) {
  const now = stageIndex(state);
  if (now === undefined) return null;
  return (
    <ol className="stages" aria-label="Etapas do ensino">
      {STAGES.map((s, i) => {
        const cls = i < now ? 'done' : i === now ? 'now' : '';
        return (
          <li key={s.key} className={`stage ${cls}`} aria-current={i === now ? 'step' : undefined} title={s.hint}>
            <span className="stage-dot" aria-hidden="true">{i < now ? <CheckIcon size={11} /> : i + 1}</span>
            <span>{s.label}</span>
            {i === now && <span className="stage-hint">{s.hint}</span>}
          </li>
        );
      })}
    </ol>
  );
}
