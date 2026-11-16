/**
 * How a request becomes a search: words without accents, case or the little
 * words of Portuguese, cut to their stem so "deleta", "deletar" and
 * "deletado" meet ("delet"), and "versão"/"versões" too ("vers"). The stems
 * go to the SQLite full-text index as prefixes; the index ranks by BM25, so a
 * rare, telling word weighs more than a common one. Synonyms ("apagar" ×
 * "deletar") are not found here: that needs search by meaning.
 */

const STOPWORDS = new Set(
  'a o as os um uma uns umas de do da dos das no na nos nas em para pra pro por com sem e ou que se ao aos à às meu minha seu sua isso esse essa este esta aqui ali la lá me te lhe eu voce você ele ela favor pode faz fazer quero preciso vamos agora sempre quando depois antes novo nova'.split(' '),
);

export function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Longest first. Enough for the vocabulary of work requests; not a full stemmer.
const SUFFIXES = ['acoes', 'icoes', 'mente', 'acao', 'icao', 'ando', 'endo', 'indo', 'ados', 'adas', 'idos', 'idas', 'oes', 'ado', 'ada', 'ido', 'ida', 'ao', 'ar', 'er', 'ir', 'as', 'es', 'os', 'a', 'e', 'o', 's'];

/** The stem of a word (keeps at least 3 letters; numbers and short words as they are). */
export function stem(word: string): string {
  if (word.length <= 4 || /\d/.test(word)) return word;
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  }
  return word;
}

/** An FTS5 query: any of the stems, each as a prefix. Empty when nothing is left to search. */
export function ftsQuery(text: string): string {
  return [...new Set(words(text).map(stem))].map((s) => `"${s}"*`).join(' OR ');
}

/** The request's stems a text also has (shown to the model as why it matched). */
export function sharedStems(request: string, text: string): string[] {
  const have = new Set(words(text).map(stem));
  return [...new Set(words(request).map(stem))].filter((s) => [...have].some((h) => h.startsWith(s)));
}
