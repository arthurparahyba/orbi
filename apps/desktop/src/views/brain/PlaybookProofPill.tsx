import type { Playbook, PlaybookProof } from '../../api';
import { api } from '../../api';

/**
 * Where a procedure stands (docs/funcionalidades/25): a draft never ran as it is written, and a
 * step that changed has to run again. "Não provar" is for a step nobody wants to run just to
 * prove a procedure (a deploy in production); it says so on the card instead of hiding it.
 */
export function PlaybookProofPill({ p, proof }: { p: Playbook; proof?: PlaybookProof }) {
  if (!proof) return null;
  const label = (id: string) => {
    const at = p.steps.findIndex((s) => s.id === id);
    return at < 0 ? id : `${at + 1} · ${p.steps[at]!.label}`;
  };
  return (
    <div className="pb-proof small">
      <span className={`pill proof-${proof.state}`}>{proof.label}</span>
      {proof.missing.filter((id) => !proof.waived.includes(id)).map((id) => (
        <button key={id} type="button" className="btn small" onClick={() => void api.waiveProof(p.name, id, true)}>
          Não provar {label(id)}
        </button>
      ))}
      {proof.waived.map((id) => (
        <button key={id} type="button" className="btn small" onClick={() => void api.waiveProof(p.name, id, false)}>
          Voltar a provar {label(id)}
        </button>
      ))}
    </div>
  );
}
