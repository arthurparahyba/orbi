import type { PlaybookRun } from '../../brain/domain/types.ts';

/**
 * One check of a finished (or abandoned) run. The review runs every analyzer registered in
 * index.ts and groups what they find by kind: a new heuristic is a new file here, with its own
 * test, and the review, the contract and the card stay as they are.
 */
export type FindingKind = 'problema' | 'melhoria' | 'aprender';

export interface RunContext {
  /** The run never finished: the delivery ended with a step still open. */
  open: boolean;
}

export interface RunAnalyzer {
  id: string;
  kind: FindingKind;
  analyze(run: PlaybookRun, ctx: RunContext): string[];
  /** What the Orbi should do about these findings, added to its instruction when there are any. */
  howToFix?: string;
}
