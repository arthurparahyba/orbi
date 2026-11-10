import type { BrainSnapshot, Playbook } from '../../api';
import { frontier } from './map';

/** The boundary of autonomy, from the brain: what the Orbi does alone, and what it still needs you for. */
export function Frontier({ snapshot, playbooks }: { snapshot: BrainSnapshot; playbooks: Playbook[] }) {
  const f = frontier(snapshot, playbooks);
  if (!f.alone.length && !f.needs.length) return null;
  return (
    <section className="frontier" aria-label="O que o Orbi sabe fazer sozinho">
      <div>
        <h3>Sei agir sozinho</h3>
        {f.alone.length ? <ul className="small">{f.alone.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted small">Nada ainda sobre conceitos.</p>}
      </div>
      <div>
        <h3>Preciso de você</h3>
        {f.needs.length ? <ul className="small">{f.needs.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted small">Nada pendente.</p>}
      </div>
    </section>
  );
}
