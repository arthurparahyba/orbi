import { RUNS_FOR_N3 } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';

/**
 * O painel de autonomia de um procedimento: o que ele já fez e o desenvolvedor aprovou, a história
 * de como o nível dele mudou, e quantas execuções ainda faltam para o N3. Atravessa dois contextos
 * — `procedures` diz se o procedimento existe, `trust` responde o resto — e é pedido de fora.
 */

type Trust = OrbiServices['trust'];

export interface AutonomyPanel {
  knownActions: ReturnType<Trust['knownActions']>;
  events: ReturnType<Trust['autonomyEvents']>;
  runsForN3: number;
}

/** O procedimento não existe. */
export interface NoProcedure {
  refused: string;
}

type Deps = Pick<OrbiServices, 'procedures' | 'trust'>;

export function procedureAutonomy(d: Deps, name: string): AutonomyPanel | NoProcedure {
  if (!d.procedures.definition.playbook(name)) return { refused: 'playbook' };

  return {
    knownActions: d.trust.knownActions(name),
    events: d.trust.autonomyEvents('playbook', name),
    runsForN3: RUNS_FOR_N3,
  };
}
