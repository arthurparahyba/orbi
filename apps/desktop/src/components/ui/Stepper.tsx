import type { UiComponent } from '@orbi/contracts';

type StepStatus = Extract<UiComponent, { component: 'stepper' }>['steps'][number]['status'];

/** A procedure's steps as they run. */
const STEP_MARK: Record<StepStatus, string> = { pending: '', running: '', done: '✓', failed: '✕', waiting: '…', skipped: '–' };

export function Stepper({ c }: { c: Extract<UiComponent, { component: 'stepper' }> }) {
  const done = c.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return (
    <section className={`ui-card stepper is-${c.status}`} aria-label={`Playbook ${c.title}`}>
      <header className="ui-card-head">
        <span className="ui-kicker">Playbook</span>
        <strong>{c.title}</strong>
        <span className={`pill pill-${c.status}`}>{c.status === 'done' ? 'Concluído' : c.status === 'failed' ? 'Falhou' : c.status === 'waiting' ? 'Aguardando' : 'Executando'}</span>
      </header>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={c.steps.length} aria-valuenow={done}>
        <span style={{ width: `${(done / Math.max(c.steps.length, 1)) * 100}%` }} />
      </div>
      <ol className="steps">
        {c.steps.map((s) => (
          <li key={s.id} className={`step is-${s.status}`}>
            <span className="step-dot">{s.status === 'running' ? <span className="spinner" /> : STEP_MARK[s.status]}</span>
            <span className="step-body">
              <span className="step-label">{s.label}</span>
              {s.note && <span className="step-note">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

