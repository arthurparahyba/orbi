import type { Entity } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';
import type { Bridge, Domain } from '../domains/src/domains.ts';

/**
 * Um domínio aberto: o vocabulário dele, os fatos, os playbooks que nasceram nele, e as pontes —
 * quem empresta o quê, para quê (documento 28). O nome vazio é `comum`.
 */

export interface DomainDetail {
  domain: Domain;
  types: string[];
  facts: Entity[];
  playbooks: Array<{ name: string; level: 1 | 2 | 3; uses: number }>;
  bridges: Bridge[];
}

/** Não existe domínio com esse nome. */
export interface NoDomain {
  refused: string;
}

type Deps = Pick<OrbiServices, 'domains' | 'knowledge'>;

export function domainDetail(d: Deps, name: string): DomainDetail | NoDomain {
  const domain = name ? d.domains.get(name) : { name: '', description: '', bornFrom: null, createdAt: '' };
  if (!domain) return { refused: 'domínio' };

  const scope = name || null;
  return {
    domain,
    types: d.domains.typesIn(scope),
    facts: d.knowledge.inDomain(scope),
    playbooks: d.domains.playbooksIn(scope),
    bridges: d.domains.bridgesOf(scope),
  };
}
