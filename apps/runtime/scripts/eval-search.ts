/**
 * How well Orbi finds the right playbook for a request: a fixed set of
 * playbooks and requests (test/fixtures/search-eval.json), each with the one
 * it should find. Reports acerto@1 (first result) and acerto@3 (among the
 * three the model gets to compare), separately for requests that share words
 * with the playbook and for synonyms/paraphrases that need search by meaning.
 *
 *   npm run eval:search -w @orbi/runtime
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BrainStore } from '../src/brain/store.ts';

interface EvalCase { text: string; expect: string; semantic?: boolean }
interface EvalSet { playbooks: Array<{ name: string; description: string; trigger: string; appliesTo: string | null; steps: Array<{ id: string; label: string; how: string }> }>; queries: EvalCase[] }

export interface EvalResult {
  group: 'palavras' | 'significado';
  total: number;
  at1: number;
  at3: number;
  misses: Array<{ text: string; expect: string; got: string[] }>;
}

export function loadEvalSet(): EvalSet {
  return JSON.parse(readFileSync(new URL('../test/fixtures/search-eval.json', import.meta.url), 'utf8')) as EvalSet;
}

/** A brain with the eval playbooks, for whatever search is being measured. */
export function evalBrain(set = loadEvalSet()): BrainStore {
  const brain = new BrainStore(':memory:');
  for (const p of set.playbooks) {
    brain.savePlaybook({ ...p, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null });
  }
  return brain;
}

export function evaluateSearch(search: (text: string) => string[], set = loadEvalSet()): EvalResult[] {
  return (['palavras', 'significado'] as const).map((group) => {
    const cases = set.queries.filter((q) => (group === 'significado') === Boolean(q.semantic));
    const result: EvalResult = { group, total: cases.length, at1: 0, at3: 0, misses: [] };
    for (const q of cases) {
      const got = search(q.text).slice(0, 3);
      if (got[0] === q.expect) result.at1++;
      if (got.includes(q.expect)) result.at3++;
      else result.misses.push({ text: q.text, expect: q.expect, got });
    }
    return result;
  });
}

const pct = (n: number, total: number) => `${Math.round((n / Math.max(total, 1)) * 100)}%`;

export function formatResults(results: EvalResult[]): string {
  const lines = results.map((r) =>
    `${r.group.padEnd(12)} acerto@1 ${pct(r.at1, r.total).padStart(4)}  acerto@3 ${pct(r.at3, r.total).padStart(4)}  (${r.total} pedidos)`,
  );
  for (const r of results) {
    for (const m of r.misses) lines.push(`  errou [${r.group}] "${m.text}" → esperado ${m.expect}, veio ${m.got.join(', ') || 'nada'}`);
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const brain = evalBrain();
  console.log(formatResults(evaluateSearch((text) => brain.searchPlaybooks(text, 3).map((c) => c.playbook.name))));
}
