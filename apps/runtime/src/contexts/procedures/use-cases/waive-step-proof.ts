import type { PlaybookProof } from '@orbi/contracts';
import type { OrbiServices } from '../../../services.ts';
import { procedureProofState } from './procedure-proofs.ts';

/**
 * "Não provar este passo agora" — um deploy em produção que ninguém vai disparar só para provar o
 * procedimento. O passo passa a contar como dispensado, e o desfazer devolve a cobrança
 * (documento 25). Pedido de fora, pela tela do Cérebro.
 */

/** O procedimento ou o passo não existe. */
export interface NotWaived {
  refused: 'procedimento' | 'passo do procedimento';
}

type Deps = Pick<OrbiServices, 'procedures'>;

export function waiveStepProof(d: Deps, name: string, stepId: string): PlaybookProof | NotWaived {
  const procedure = d.procedures.definition.playbook(name);
  const step = procedure?.steps.find((x) => x.id === stepId);
  if (!procedure || !step) return { refused: 'passo do procedimento' };

  // Dispensa é prova sem execução: guarda o `how` de agora, para a mudança do passo cobrar de novo.
  d.procedures.proofs.record(procedure.name, step.id, step.how, null);
  return procedureProofState(d, procedure.name);
}

export function unwaiveStepProof(d: Deps, name: string, stepId: string): PlaybookProof | NotWaived {
  const procedure = d.procedures.definition.playbook(name);
  if (!procedure) return { refused: 'procedimento' };

  d.procedures.proofs.remove(procedure.name, stepId);
  return procedureProofState(d, procedure.name);
}
