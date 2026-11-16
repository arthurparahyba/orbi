import type { OrbiServices } from '../../../services.ts';

/**
 * Os fatos que esta execução usou e que têm receita de atualização (documento 28, fase D). É a
 * resposta ao caso que paga a complexidade da receita: o passo foi buscar o log de um serviço e o
 * log group não existe mais — como refazer o caminho? Os fatos que o passo usou estão nas entradas
 * resolvidas da execução, e quais deles sabem se conferir está no tipo de cada um.
 *
 * Só **lista**. Rodar a receita é do modelo, pelo `playbook_start`, que passa pelo portão.
 */

export interface Refreshable {
  /** A entrada do procedimento, o fato a que ela se resolveu, e de que tipo ele é. */
  input: string;
  fact: string;
  type: string;
  /** O procedimento que confere esse fato na fonte. */
  playbook: string;
  /** Quando foi conferido lá pela última vez. */
  checkedAt: string | null;
}

type Deps = Pick<OrbiServices, 'knowledge' | 'procedures'>;

export function staleInputsOfRun(d: Deps, runId: string): Refreshable[] {
  const run = d.procedures.execution.run(runId);
  if (!run) return [];

  const out: Refreshable[] = [];
  for (const [input, resolved] of Object.entries(run.resolved ?? {})) {
    if (!resolved?.entity || resolved.undone) continue;
    const fact = d.knowledge.get(resolved.entity);
    const recipe = fact && d.knowledge.type(fact.type)?.refresh;
    if (!fact || !recipe || !d.procedures.definition.playbook(recipe)) continue;
    out.push({ input, fact: fact.id, type: fact.type, playbook: recipe, checkedAt: fact.checkedAt ?? null });
  }
  return out;
}
