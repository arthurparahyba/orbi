import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import { detect, type Detected, type DiagnosisCategory, type Seen } from './detectors.ts';

export { detect, countsLine, DETECTORS } from './detectors.ts';
export type { Detected, DiagnosisCategory, Seen } from './detectors.ts';

export interface Diagnosis extends Detected {
  id: string;
  runId: string;
  playbook: string;
  /** The step it happened in; null = outside any step (always written down, unlike in a fresh finding). */
  step: string | null;
  /** Times this very defect was seen (same fingerprint), here and in earlier executions. */
  times: number;
  status: 'open' | 'dismissed';
  at: string;
}

/** O que merece interromper o desenvolvedor: tudo menos os deslizes que o modelo corrigiu na hora. */
export const worthTelling = (found: readonly Diagnosis[]): Diagnosis[] => found.filter((f) => !f.minor);

type Row = Record<string, unknown>;
const toDiagnosis = (r: Row): Diagnosis => ({
  id: String(r.id),
  runId: String(r.run_id),
  playbook: String(r.playbook),
  detector: String(r.detector),
  category: String(r.category) as DiagnosisCategory,
  title: String(r.title),
  detail: String(r.detail),
  ...(r.hint ? { hint: String(r.hint) } : {}),
  ...(Number(r.minor) ? { minor: true } : {}),
  step: (r.step as string | null) ?? null,
  fingerprint: String(r.fingerprint),
  times: Number(r.times),
  status: String(r.status) as 'open' | 'dismissed',
  at: String(r.at),
});

/**
 * What the Orbi found wrong with itself and with the model's calls (docs/funcionalidades/24),
 * execution by execution. It is kept apart from the review of the procedure on purpose: a defect
 * of the application must never come back as a change to the developer's procedure.
 */
export class Diagnoses {
  constructor(private readonly db: DatabaseSync) {}

  /** Runs the detectors over one execution and writes down what they found. */
  record(seen: Seen): Diagnosis[] {
    const found = detect(seen);
    const at = new Date().toISOString();
    return found.map((f) => {
      // The same defect seen before: counted, so ten machines with one bug are one bug.
      const times = Number((this.db.prepare('SELECT count(*) AS n FROM diagnoses WHERE fingerprint = ?').get(f.fingerprint) as Row).n) + 1;
      const id = ulid();
      this.db
        .prepare('INSERT INTO diagnoses (id, run_id, playbook, detector, category, title, detail, hint, step, fingerprint, times, minor, status, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'open\', ?)')
        .run(id, seen.run.id, seen.run.playbook, f.detector, f.category, f.title, f.detail, f.hint ?? null, f.step ?? null, f.fingerprint, times, f.minor ? 1 : 0, at);
      return { ...f, step: f.step ?? null, id, runId: seen.run.id, playbook: seen.run.playbook, times, status: 'open' as const, at };
    });
  }

  forRun(runId: string): Diagnosis[] {
    return (this.db.prepare('SELECT * FROM diagnoses WHERE run_id = ? ORDER BY at, rowid').all(runId) as Row[]).map(toDiagnosis);
  }

  /** The open ones, newest first: the list of executions shows them and the detail screen reads them. */
  list(limit = 200): Diagnosis[] {
    return (this.db.prepare('SELECT * FROM diagnoses WHERE status = \'open\' ORDER BY at DESC, rowid DESC LIMIT ?').all(limit) as Row[]).map(toDiagnosis);
  }

  /** The developer read it and does not want it on the list any more. */
  dismiss(id: string): boolean {
    return Number(this.db.prepare('UPDATE diagnoses SET status = \'dismissed\' WHERE id = ?').run(id).changes) > 0;
  }
}
