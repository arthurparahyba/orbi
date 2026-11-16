import type { PlaybookProof } from '@orbi/contracts';
import type { OrbiServices } from '../../../services.ts';
import { proofOf, proofLabel } from '../proofs/src/proofs.ts';

/**
 * Onde cada procedimento está em termos de prova: quantos dos seus passos já rodaram como estão
 * escritos (documento 25), com a linha que o desenvolvedor lê no cartão. Atravessa dois módulos
 * deste contexto (`definition` para os passos, `proofs` para o que já rodou) e é pedido de fora,
 * pela tela do Cérebro.
 */

type Deps = Pick<OrbiServices, 'procedures'>;

/** De um procedimento. Quem chama já sabe que ele existe. */
export function procedureProofState(d: Deps, name: string): PlaybookProof {
  const procedure = d.procedures.definition.playbook(name)!;
  const proof = proofOf(procedure.steps, d.procedures.proofs.list(name));
  return { ...proof, label: proofLabel(proof, procedure.steps) };
}

/** De todos, numa resposta só: a tela mostra em cada cartão. */
export function procedureProofs(d: Deps): Record<string, PlaybookProof> {
  const all = d.procedures.definition.playbooks();
  return Object.fromEntries(all.map((procedure) => [procedure.name, procedureProofState(d, procedure.name)]));
}
