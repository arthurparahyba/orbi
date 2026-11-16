import type { Entity } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';

/**
 * Para qual domínio vai o que o Orbi está aprendendo (documento 28). O modelo **não escolhe**: a
 * cadeia abaixo decide e diz por quê, e o desenvolvedor corrige no cartão que ele já aprova. Um
 * modelo livre para nomear domínios inventaria `aws`, `infra-aws` e `AWS` em três turnos, e aí o
 * vocabulário morre — que é justamente o que o domínio existe para salvar.
 */

export interface Suggestion {
  /** O domínio sugerido; nulo é `comum`. */
  domain: string | null;
  /** A frase que aparece no cartão, do lado do domínio. */
  because: string;
  /** Verdadeiro quando o domínio ainda não existe: o cartão pede para criar. */
  isNew?: boolean;
}

export interface About {
  /** O tipo do fato, quando é um fato. */
  type?: string;
  /** O domínio do playbook em execução, quando há execução. */
  runDomain?: string | null;
  /** Fatos que a conversa tocou (o chamador passa o que já buscou). */
  nearby?: Entity[];
  /** Nome proposto quando nada serve, vindo do que a conversa usou (um endereço, um programa). */
  proposed?: string;
}

type Deps = Pick<OrbiServices, 'domains'>;

export function suggestDomain(d: Deps, about: About): Suggestion {
  const ofType = about.type ? d.domains.domainOfType(about.type) : null;
  if (ofType) return { domain: ofType, because: `porque o tipo ${about.type} é do domínio ${ofType}` };

  const spread = about.type ? d.domains.domainsUsingType(about.type) : [];
  if (spread.length > 1) return { domain: null, because: `porque o tipo ${about.type} já tem fato em ${spread.length} domínios` };

  if (about.runDomain) return { domain: about.runDomain, because: `porque a execução é do domínio ${about.runDomain}` };

  const touched = mostTouched(about.nearby ?? []);
  if (touched) return { domain: touched.domain, because: `porque ${touched.n} do que esta conversa olhou é do domínio ${touched.domain}` };

  if (about.proposed && !d.domains.get(about.proposed)) {
    return { domain: about.proposed, isNew: true, because: 'porque nada que esta conversa olhou é de um domínio que já existe' };
  }
  return { domain: null, because: 'porque nada aqui aponta para um domínio: fica comum até alguém dizer o contrário' };
}

/** O domínio mais presente entre os fatos que a conversa olhou, se houver um só na frente. */
function mostTouched(nearby: Entity[]): { domain: string; n: number } | undefined {
  const counts = new Map<string, number>();
  for (const entity of nearby) {
    if (entity.domain) counts.set(entity.domain, (counts.get(entity.domain) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  // Empate não decide nada: melhor cair na regra seguinte do que escolher por ordem alfabética.
  if (!first || (second && second[1] === first[1])) return undefined;
  return { domain: first[0], n: first[1] };
}
