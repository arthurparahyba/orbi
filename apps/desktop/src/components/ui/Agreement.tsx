import type { UiComponent } from '@orbi/contracts';
import { Question } from './Question';

type C = Extract<UiComponent, { component: 'agreement' }>;

/**
 * The end of a rehearsal: what the Orbi understood of the procedure after trying it out
 * (where it starts and ends, what it receives, what stays out, what the rehearsal corrected),
 * to confirm before the learning card.
 */
export function Agreement({ c }: { c: C }) {
  return (
    <section className="ui-card agreement" aria-label="Combinando início e fim">
      <header className="ui-card-head"><span className="ui-kicker">Combinando início e fim</span></header>
      <dl className="kv agreement-kv">
        <dt>Começa quando</dt><dd>{c.start}</dd>
        {c.receives.length > 0 && <><dt>Preciso receber</dt><dd>{c.receives.join(', ')}</dd></>}
        <dt>Termina quando</dt><dd>{c.end}</dd>
        {c.outside.length > 0 && <><dt>Fica de fora</dt><dd>{c.outside.join('; ')}</dd></>}
      </dl>
      {c.corrections.length > 0 && (
        <>
          <span className="ui-kicker">O que o ensaio corrigiu na explicação</span>
          <ul className="agreement-fixes small">
            {c.corrections.map((x, i) => <li key={i}><span className="muted">{x.explained}</span> → {x.actual}</li>)}
          </ul>
        </>
      )}
      <Question c={{ component: 'question', id: `${c.id}-q`, question: c.question, options: ['Está certo', 'Ajustar'], inboxId: c.inboxId }} />
    </section>
  );
}
