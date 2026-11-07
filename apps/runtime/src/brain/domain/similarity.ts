import type { Playbook } from './types.ts';

/**
 * "Já sei algo parecido?": the first, cheap pass. It finds the playbooks that
 * share words with a request; the model then reads them and decides whether
 * one is the same thing, something similar or unrelated. Words are compared
 * without accents, case or plural, and without the little words of Portuguese.
 */

const STOPWORDS = new Set(
  'a o as os um uma uns umas de do da dos das no na nos nas em para pra por com sem e ou que se ao aos à às meu minha seu sua isso esse essa este esta aqui ali la lá me te lhe eu voce você ele ela favor pode faz fazer quero preciso vamos agora sempre quando depois antes'.split(' '),
);

export function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}

export interface Candidate {
  playbook: Playbook;
  /** Words of the request the playbook also has. */
  shared: string[];
  score: number;
}

/** Playbooks sharing words with `text`, best first. The name and trigger weigh more than the steps. */
export function similarPlaybooks(text: string, playbooks: Playbook[], limit = 3): Candidate[] {
  const query = new Set(words(text));
  if (query.size === 0) return [];
  return playbooks
    .map((playbook) => {
      const strong = new Set([...words(playbook.name), ...words(playbook.description), ...words(playbook.trigger), ...words(playbook.appliesTo ?? '')]);
      const weak = new Set(playbook.steps.flatMap((s) => [...words(s.label), ...words(s.how)]));
      const shared = [...query].filter((w) => strong.has(w) || weak.has(w));
      const score = [...query].reduce((sum, w) => sum + (strong.has(w) ? 2 : weak.has(w) ? 1 : 0), 0);
      return { playbook, shared, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.playbook.successes - a.playbook.successes)
    .slice(0, limit);
}
