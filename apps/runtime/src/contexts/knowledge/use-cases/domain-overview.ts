import type { OrbiServices } from '../../../services.ts';
import type { DomainSize } from '../domains/src/domains.ts';

/**
 * A primeira tela do Cérebro: os domínios, o tamanho de cada um, quem empresta para quem, e o que
 * ficou sem domínio (documento 28). `comum` vem primeiro e sempre, porque é a camada de base.
 */

export interface DomainOverview {
  domains: DomainSize[];
  /** Por domínio: para quais ele empresta fato, e quantos. */
  lends: Array<{ from: string; to: string; facts: number }>;
  /** Fatos de antes dos domínios, que entram em toda busca até alguém dizer de onde são. */
  undecided: Array<{ id: string; type: string }>;
}

type Deps = Pick<OrbiServices, 'domains'>;

export function domainOverview(d: Deps): DomainOverview {
  const pairs = new Map<string, number>();
  for (const bridge of d.domains.bridges()) {
    const key = `${bridge.fromDomain}\u0000${bridge.toDomain}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  const lends = [...pairs].map(([key, facts]) => {
    const [from = '', to = ''] = key.split('\u0000');
    return { from, to, facts };
  });

  return { domains: d.domains.sizes(), lends, undecided: d.domains.withoutDomain(10) };
}
