import type { OrbiServices } from '../../../services.ts';
import { conceptsOf, packageOf, secretsNamedIn, shareable, type ProcedurePackage } from '../definition/src/sharing.ts';

/**
 * Exportar um procedimento para mandar a alguém (documento 30). O corte está em `sharing.ts`:
 * vocabulário viaja, dados não. Aqui é só a montagem: pegar o procedimento, os conceitos que ele
 * cita, os nomes dos segredos, e os fatos que quem exporta escolheu — um por um, nunca por padrão.
 */

export interface NoProcedure {
  refused: 'procedimento';
  detail: string;
}

type Deps = Pick<OrbiServices, 'knowledge' | 'procedures'>;

export function exportProcedure(
  d: Deps,
  name: string,
  include: { facts?: string[]; learnings?: boolean } = {},
  at = new Date().toISOString(),
): ProcedurePackage | NoProcedure {
  const procedure = d.procedures.definition.playbook(name);
  if (!procedure) return { refused: 'procedimento', detail: name };
  const types = conceptsOf(procedure).map((c) => d.knowledge.type(c)).filter((t) => !!t);
  const facts = (include.facts ?? []).map((id) => d.knowledge.get(id)).filter((f) => !!f);
  const links = facts.flatMap((f) => d.knowledge.neighbors(f.id).out);
  return packageOf(shareable(procedure), {
    types,
    secrets: secretsNamedIn(procedure),
    facts,
    links,
    learnings: include.learnings ? d.procedures.learnings.list(name) : [],
  }, at);
}
