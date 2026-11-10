import { useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { api } from '../../api';
import { BulbIcon } from '../Icons';

type C = Extract<UiComponent, { component: 'learned_facts' }>;

/**
 * "Aprendi executando": what a run found out by itself about its inputs (passo 0). You said
 * "xpto"; in the system it is xpto-mfe. Each one can be taken back.
 */
export function LearnedFacts({ c }: { c: C }) {
  const [undone, setUndone] = useState<Record<string, boolean>>(() => Object.fromEntries(c.items.map((i) => [i.input, i.undone])));
  const [error, setError] = useState('');
  const undo = async (input: string) => {
    setError('');
    try {
      await api.undoResolved(c.runId, input);
      setUndone((u) => ({ ...u, [input]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="ui-card learned-facts" aria-label="Aprendi executando">
      <header className="ui-card-head">
        <span className="ui-icon info"><BulbIcon /></span>
        <strong>{c.title}</strong>
      </header>
      <ul className="learned-list">
        {c.items.map((i) => (
          <li key={i.input} className={undone[i.input] ? 'is-undone' : ''}>
            <span>
              {i.learned === 'alias'
                ? <>“{i.value}” é <code>{i.entity}</code></>
                : i.value === i.entity
                  ? <>conheci <code>{i.entity}</code></>
                  : <>“{i.value}” é <code>{i.entity}</code>, que eu não conhecia</>}
              <span className="muted"> · {i.input}</span>
            </span>
            {undone[i.input]
              ? <span className="muted small">desfeito</span>
              : <button type="button" className="btn small" onClick={() => undo(i.input)}>Desfazer</button>}
          </li>
        ))}
      </ul>
      {error && <p className="small error">{error}</p>}
    </section>
  );
}
