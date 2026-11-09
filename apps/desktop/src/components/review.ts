import type { ExecutionReview, Finding } from '@orbi/contracts';

/** Sections of the card for the kinds of finding besides problems (problems go under each run). */
export const FINDING_SECTIONS: Array<{ kind: Finding['kind']; title: string }> = [
  { kind: 'melhoria', title: 'Pode melhorar' },
  { kind: 'aprender', title: 'Aprendeu na execução' },
];

export const findingsOf = (run: ExecutionReview['runs'][number], kind: Finding['kind']) => run.findings.filter((f) => f.kind === kind).map((f) => f.text);

type OldRun = { problems?: string[]; suggestions?: string[]; learned?: string[]; findings?: Finding[] };

/**
 * The review carried by a signal's attributes, if it is one. Reviews saved before the findings
 * list (problems / suggestions / learned) still open: they are read into findings.
 */
export function reviewOf(attributes: Record<string, unknown> | undefined): ExecutionReview | undefined {
  const raw = attributes?.review;
  if (typeof raw !== 'string') return undefined;
  try {
    const r = JSON.parse(raw) as ExecutionReview;
    r.runs = r.runs.map((x) => {
      const old = x as typeof x & OldRun;
      if (old.findings) return x;
      const as = (kind: Finding['kind'], texts?: string[]) => (texts ?? []).map((text) => ({ kind, text, analyzer: 'antigo' }));
      return { ...x, findings: [...as('problema', old.problems), ...as('melhoria', old.suggestions), ...as('aprender', old.learned)] };
    });
    return r;
  } catch {
    return undefined;
  }
}
