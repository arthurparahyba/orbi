import type { Finding } from '@orbi/contracts';
import type { PlaybookRun } from '../../brain/domain/types.ts';
import type { RunAnalyzer, RunContext } from './types.ts';
import { deviations, openRun, stepClaims } from './run-state.ts';
import { inlineScripts, tablesByHand } from './scripts.ts';
import { knownProblems } from './knowledge.ts';

export type { FindingKind, RunAnalyzer, RunContext } from './types.ts';

/** Every check of a run, in the order its findings are shown. A new check: a new file, one entry here. */
export const ANALYZERS: readonly RunAnalyzer[] = [openRun, stepClaims, deviations, inlineScripts, tablesByHand, knownProblems];

/** What every analyzer finds in a run (each text once). */
export function analyzeRun(run: PlaybookRun, ctx: RunContext, analyzers: readonly RunAnalyzer[] = ANALYZERS): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const a of analyzers) {
    for (const text of a.analyze(run, ctx)) {
      if (seen.has(text)) continue;
      seen.add(text);
      out.push({ kind: a.kind, text, analyzer: a.id });
    }
  }
  return out;
}

/** How to fix what was found: the analyzers that found something say it. */
export function howToFix(findings: readonly Finding[], analyzers: readonly RunAnalyzer[] = ANALYZERS): string[] {
  const found = new Set(findings.map((f) => f.analyzer));
  return analyzers.filter((a) => a.howToFix && found.has(a.id)).map((a) => a.howToFix!);
}
