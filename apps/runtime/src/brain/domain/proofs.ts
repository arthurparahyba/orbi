/**
 * Whether a procedure was ever run as it is written (docs/funcionalidades/25). The card that
 * stores it is not the end: its steps are the ones the rehearsal taught, in words that never ran
 * by themselves. A step is proven while the instruction that ran is still the instruction it has,
 * so correcting a step takes its proof away by itself and the procedure asks to be run again.
 * Pure rules.
 */

/** What is compared: the step's instruction as it ran, cut to keep the row small. */
export const HOW_KEPT = 1000;
export const howKey = (how: string) => how.trim().replace(/\s+/g, ' ').slice(0, HOW_KEPT);

export interface StepProof {
  playbook: string;
  step: string;
  /** The instruction that ran (or that the developer excused), as `howKey` keeps it. */
  how: string;
  /** The run that proved it; null when the developer excused the step from being proven. */
  runId: string | null;
  at: string;
}

/** `rascunho`: nothing of it ever ran. `parcial`: some steps still to prove. `provado`: all of them. */
export type ProofState = 'rascunho' | 'parcial' | 'provado';

export interface Proof {
  state: ProofState;
  /** Steps still to prove, in the procedure's order. */
  missing: string[];
  /** Steps the developer excused (a deploy nobody wants to run to prove a procedure). */
  waived: string[];
}

/** Where a procedure stands: which of its steps ran as they are written now. */
export function proofOf(steps: ReadonlyArray<{ id: string; how: string }>, proofs: readonly StepProof[]): Proof {
  const by = new Map(proofs.map((p) => [p.step, p]));
  const held = (s: { id: string; how: string }) => {
    const proof = by.get(s.id);
    return proof && proof.how === howKey(s.how) ? proof : undefined;
  };
  const missing = steps.filter((s) => !held(s)).map((s) => s.id);
  const waived = steps.filter((s) => held(s)?.runId === null).map((s) => s.id);
  if (steps.length === 0 || missing.length === steps.length) return { state: 'rascunho', missing, waived };
  return { state: missing.length === 0 ? 'provado' : 'parcial', missing, waived };
}

/** What the developer reads: "rascunho", "provado" or "falta provar o passo 3 · Filtrar". */
export function proofLabel(proof: Proof, steps: ReadonlyArray<{ id: string; label: string }>): string {
  const name = (id: string) => {
    const at = steps.findIndex((s) => s.id === id);
    return at < 0 ? id : `${at + 1} · ${steps[at]!.label}`;
  };
  if (proof.state === 'rascunho') return 'rascunho: ainda não rodou como está escrito';
  const waived = proof.waived.length ? ` · você dispensou ${proof.waived.length === 1 ? 'o passo' : 'os passos'} ${proof.waived.map(name).join(', ')}` : '';
  if (proof.state === 'provado') return `provado${waived}`;
  return `falta provar ${proof.missing.length === 1 ? 'o passo' : 'os passos'} ${proof.missing.map(name).join(', ')}${waived}`;
}

/**
 * What the Orbi is told after it stores or corrects a procedure: a procedure whose steps never ran
 * as they are written is not finished, and running it once is how it gets finished.
 */
export function howToProve(playbook: string, proof: Proof, steps: ReadonlyArray<{ id: string; label: string }>): string | undefined {
  if (proof.state === 'provado') return undefined;
  const what = proof.state === 'rascunho'
    ? `${playbook} está em rascunho: os passos que você escreveu nunca rodaram como estão`
    : `em ${playbook}, ${proofLabel(proof, steps)}`;
  return `${what}. Rode agora com playbook_start para provar, do começo ao fim, com as entradas que o desenvolvedor deu; se algo falhar, ache outro jeito, siga até a entrega e no fim proponha o passo corrigido com o que você aprendeu. Se o desenvolvedor não quiser rodar agora (um passo que publica em produção, por exemplo), diga que fica em rascunho e pare.`;
}
