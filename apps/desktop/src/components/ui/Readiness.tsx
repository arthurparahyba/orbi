import type { UiComponent } from '@orbi/contracts';

type C = Extract<UiComponent, { component: 'readiness' }>;

/**
 * "Sei / não sei" before a run over concepts: each thing the procedure needs, checked against the
 * brain by the runtime (not the model's opinion). What is not known becomes a question.
 */
export function Readiness({ c }: { c: C }) {
  const unknown = c.items.filter((i) => !i.known).length;
  return (
    <section className="ui-card readiness" aria-label="O que eu sei e o que não sei">
      <header className="ui-card-head">
        <span className="ui-kicker">O que eu sei · {c.title}</span>
        <span className="pill">{unknown ? `${unknown} para descobrir` : 'sei tudo'}</span>
      </header>
      <ul className="readiness-list">
        {c.items.map((i, n) => (
          <li key={n} className={i.known ? 'is-known' : 'is-unknown'}>
            <span className="readiness-mark" aria-label={i.known ? 'sei' : 'não sei'}>{i.known ? '✓' : '?'}</span>
            <span className="readiness-label">{i.label}</span>
            <span className="muted small">{i.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
