import type { Autonomy, Playbook } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';

/**
 * Mudar a autonomia de um procedimento pela tela: se ele só observa ou age, e em que nível (e até
 * que nível pode subir sozinho). Atravessa dois contextos — `procedures` guarda o procedimento,
 * `trust` guarda o nível — e é pedido de fora, então mora aqui (documento 27).
 */

/** O procedimento não existe. */
export interface AutonomyNotSet {
  refused: string;
}

export interface AutonomyChange {
  autonomy?: Autonomy;
  level?: 1 | 2 | 3;
  levelMax?: 1 | 2 | 3;
}

type Deps = Pick<OrbiServices, 'procedures' | 'trust'>;

export function setProcedureAutonomy(d: Deps, name: string, change: AutonomyChange): Playbook | AutonomyNotSet {
  if (!d.procedures.definition.playbook(name)) return { refused: `playbook não existe: ${name}` };

  if (change.autonomy) d.procedures.definition.setPlaybookAutonomy(name, change.autonomy);
  if (change.level !== undefined || change.levelMax !== undefined) {
    d.trust.setPlaybookLevel(name, { level: change.level, levelMax: change.levelMax });
  }
  return d.procedures.definition.playbook(name)!;
}
