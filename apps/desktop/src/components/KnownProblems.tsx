import type { KnownProblemView } from '../views/conversation/tools';

/**
 * Under a failed command: the brain already knows this error. Shown open, so the developer
 * sees what the Orbi will follow without opening the command.
 */
export function KnownProblems({ problems }: { problems: KnownProblemView[] }) {
  if (!problems.length) return null;
  return (
    <div className="known-problems">
      {problems.map((p) => (
        <div key={p.id} className="known-problem">
          <span className="ui-kicker">Problema conhecido</span> <strong>{p.id}</strong>
          {p.causa && <p className="small"><span className="muted">Causa:</span> {p.causa}</p>}
          <p className="small"><span className="muted">Solução:</span> {p.solucao}</p>
        </div>
      ))}
    </div>
  );
}
