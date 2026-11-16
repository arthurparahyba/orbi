import type { OrbiServices } from '../../../services.ts';

/**
 * Como conferir um fato na fonte (documento 28, fase D). Uma vez no cérebro, um dado virava
 * verdade e ninguém sabia como atualizá-lo. A receita é um **procedimento normal** com um
 * parâmetro do conceito: `atualizar-conta-aws(conta)` roda o comando, compara, e propõe a
 * atualização pelo portão de sempre. Nenhuma maquinaria nova.
 *
 * Isto só diz **o que rodar e com quê**. Rodar é do modelo, pelo `playbook_start`, que já passa
 * pelo portão: um caso de uso não executa procedimento nem fala com a conversa.
 */

export interface Refresh {
  /** O procedimento que confere. */
  playbook: string;
  /** O fato a conferir, e de que tipo ele é. */
  fact: string;
  type: string;
  /** Quando foi conferido na fonte pela última vez, e onde foi achado. */
  checkedAt: string | null;
  foundIn: string | null;
}

/** O tipo não tem receita, ou o fato não existe. */
export interface NoRefresh {
  refused: 'fato-nao-existe' | 'tipo-sem-receita' | 'receita-nao-existe';
  detail: string;
}

type Deps = Pick<OrbiServices, 'knowledge' | 'procedures'>;

export function howToRefresh(d: Deps, factId: string): Refresh | NoRefresh {
  const fact = d.knowledge.get(factId);
  if (!fact) return { refused: 'fato-nao-existe', detail: factId };

  const recipe = d.knowledge.type(fact.type)?.refresh;
  if (!recipe) return { refused: 'tipo-sem-receita', detail: `o tipo ${fact.type} não diz como conferir um fato dele na fonte` };

  // A receita é o nome de um procedimento: se alguém o apagou, isto para de valer e precisa dizer.
  if (!d.procedures.definition.playbook(recipe)) {
    return { refused: 'receita-nao-existe', detail: `o tipo ${fact.type} aponta para ${recipe}, que não existe mais` };
  }

  return { playbook: recipe, fact: fact.id, type: fact.type, checkedAt: fact.checkedAt ?? null, foundIn: fact.foundIn?.ref ?? null };
}
