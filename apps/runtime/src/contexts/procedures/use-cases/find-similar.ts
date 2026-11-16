import type { Playbook, PlaybookScript } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';

/**
 * "Já sei algo parecido?" — o desenvolvedor pediu uma ação, ou o Orbi está a ponto de guardar um
 * procedimento. Antes de qualquer das duas coisas, o que já existe é procurado aqui.
 *
 * Orquestração: só chamadas (documento 27). Quem chama decide o que mostrar ao modelo ou à tela.
 */

/** Um candidato, com o que a decisão precisa: o que ele faz, como faz, e o histórico dele. */
export interface SimilarProcedure {
  procedure: Playbook;
  /** As variações que saíram dele, por nome. */
  variations: string[];
  /** Os radicais que o pedido e este procedimento têm em comum: é o porquê de ele ter vindo. */
  sharedStems: string[];
  /** Os scripts só por nome e descrição: o código vem com `brain_query` sobre o procedimento. */
  scripts: Array<Pick<PlaybookScript, 'name' | 'description'>>;
}

type Deps = Pick<OrbiServices, 'procedures'>;

/**
 * Os procedimentos que se parecem com o pedido, do mais parecido para o menos. Lista vazia
 * significa "nada parecido": quem chama segue normalmente.
 */
export function findSimilarProcedures(d: Deps, request: string, limit = 3): SimilarProcedure[] {
  const found = d.procedures.definition.searchPlaybooks(request, limit);
  if (found.length === 0) return [];
  // As variações de cada candidato vêm do conjunto: uma versão aponta para a sua base.
  const all = d.procedures.definition.playbooks();
  return found.map(({ playbook, shared }) => ({
    procedure: playbook,
    variations: all.filter((other) => other.variationOf === playbook.name).map((other) => other.name),
    sharedStems: shared,
    scripts: playbook.scripts.map((s) => ({ name: s.name, description: s.description })),
  }));
}
