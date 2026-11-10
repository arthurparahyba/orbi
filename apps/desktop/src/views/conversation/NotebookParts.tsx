import type { ReactNode } from 'react';
import type { ConversationNotebook } from '../../api';
import { CheckIcon, XIcon } from '../../components/Icons';
import { readable, stepMark } from './notebook';

/** One block of the panel: a small caps title and what goes under it. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="nb-sec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

const MARK: Record<ReturnType<typeof stepMark>['mark'], ReactNode> = {
  done: <CheckIcon size={12} />, fail: <XIcon size={12} />, wait: '?', now: '●', todo: '○', skip: '–',
};

/** Steps with how they went (tried) or numbered (learned). */
export function Steps({ steps, numbered = false }: { steps: ConversationNotebook['steps']; numbered?: boolean }) {
  return (
    <ol className="nb-steps">
      {steps.map((s, i) => {
        const m = stepMark(s.status);
        return (
          <li key={`${i}-${s.label}`} className={`nb-step is-${m.mark}`}>
            <span className="nb-mark" aria-hidden="true">{numbered ? i + 1 : MARK[m.mark]}</span>
            <span>
              {readable(s.label)}
              {m.hint && <span className="muted"> · {m.hint}</span>}
              {s.note && <span className="nb-note">{s.note}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Start and end agreed after the rehearsal, what stays out and what the rehearsal corrected. */
export function Agreed({ agreement }: { agreement: NonNullable<ConversationNotebook['agreement']> }) {
  return (
    <>
      <Section title="Começa e termina">
        <p>{agreement.start} <span className="muted">→</span> {agreement.end}</p>
      </Section>
      {agreement.outside.length > 0 && <Section title="Fica de fora"><p className="muted">{agreement.outside.join(' · ')}</p></Section>}
      {agreement.corrections.length > 0 && (
        <Section title="O ensaio corrigiu">
          <ul className="nb-list">{agreement.corrections.map((c) => <li key={c.explained}><s className="muted">{c.explained}</s> → {c.actual}</li>)}</ul>
        </Section>
      )}
    </>
  );
}

/** Facts that came from this conversation. */
export function Noted({ noted }: { noted: ConversationNotebook['noted'] }) {
  if (noted.length === 0) return null;
  return (
    <Section title="Já anotei">
      <ul className="nb-list">{noted.map((n) => <li key={n.id}><code>{n.id}</code> <span className="muted">é {n.type}</span></li>)}</ul>
    </Section>
  );
}

export function Receives({ receives }: { receives: string[] }) {
  if (receives.length === 0) return null;
  return <Section title="Recebe"><p className="mono nb-mono">{receives.join(' · ')}</p></Section>;
}
