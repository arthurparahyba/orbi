import type { OrbiServices } from '../../../services.ts';

/**
 * O painel de uma entidade na tela do Cérebro: ela, com quem se liga, o que está a dois passos de
 * distância, e quem depende dela (o que quebra se ela for apagada). Quatro leituras do grafo numa
 * resposta só, pedidas de fora (documento 27).
 */

/** A entidade não existe. */
export interface NoEntity {
  refused: string;
}

type Deps = Pick<OrbiServices, 'knowledge'>;
type Facts = OrbiServices['knowledge'];

export interface EntityPanel {
  entity: NonNullable<ReturnType<Facts['get']>>;
  relations: ReturnType<Facts['neighbors']>;
  nearby: ReturnType<Facts['reachable']>;
  dependents: ReturnType<Facts['entityDependents']>;
}

export function entityPanel(d: Deps, id: string): EntityPanel | NoEntity {
  const entity = d.knowledge.get(id);
  if (!entity) return { refused: 'entidade' };

  return {
    entity,
    relations: d.knowledge.neighbors(entity.id),
    nearby: d.knowledge.reachable(entity.id, 2),
    dependents: d.knowledge.entityDependents(entity.id),
  };
}
