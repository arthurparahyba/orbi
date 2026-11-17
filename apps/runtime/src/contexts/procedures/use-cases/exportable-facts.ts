import type { OrbiServices } from '../../../services.ts';
import { conceptsOf, revealsOf } from '../definition/src/sharing.ts';

/**
 * Os fatos que quem exporta pode escolher mandar junto, com o que cada um revela escrito do lado
 * (documento 30). São os fatos dos conceitos que o procedimento cita: um procedimento sobre
 * `Ambiente` só oferece ambientes. A decisão só é informada se o valor aparecer antes dela.
 */

export interface ExportableFact {
  id: string;
  type: string;
  /** O que vai junto se este fato for marcado, em uma linha. */
  reveals: string;
}

type Deps = Pick<OrbiServices, 'knowledge' | 'procedures'>;

export function exportableFacts(d: Deps, name: string): ExportableFact[] {
  const procedure = d.procedures.definition.playbook(name);
  if (!procedure) return [];
  return conceptsOf(procedure)
    .flatMap((concept) => d.knowledge.byType(concept))
    .map((fact) => ({ id: fact.id, type: fact.type, reveals: revealsOf(fact) }));
}
