import type { DatabaseSync } from 'node:sqlite';
import { now, type Row } from './rows.ts';
import { howKey, type StepProof } from '../domain/proofs.ts';

const toProof = (r: Row): StepProof => ({
  playbook: String(r.playbook),
  step: String(r.step),
  how: String(r.how),
  runId: (r.run_id as string | null) ?? null,
  at: String(r.at),
});

/** Which steps of a procedure already ran as they are written (docs/funcionalidades/25). */
export class ProofRepo {
  constructor(private readonly db: DatabaseSync) {}

  /** A step ran as it is written, in a real run (`runId`), or the developer excused it (null). */
  record(playbook: string, step: string, how: string, runId: string | null): void {
    this.db
      .prepare('INSERT INTO playbook_proofs (playbook, step, how, run_id, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(playbook, step) DO UPDATE SET how = excluded.how, run_id = excluded.run_id, at = excluded.at')
      .run(playbook, step, howKey(how), runId, now());
  }

  list(playbook: string): StepProof[] {
    return (this.db.prepare('SELECT * FROM playbook_proofs WHERE playbook = ?').all(playbook) as Row[]).map(toProof);
  }

  all(): StepProof[] {
    return (this.db.prepare('SELECT * FROM playbook_proofs').all() as Row[]).map(toProof);
  }

  /** The developer took back "do not prove this step": it goes back to being a step to prove. */
  remove(playbook: string, step: string): boolean {
    return Number(this.db.prepare('DELETE FROM playbook_proofs WHERE playbook = ? AND step = ?').run(playbook, step).changes) > 0;
  }

  forget(playbook: string): void {
    this.db.prepare('DELETE FROM playbook_proofs WHERE playbook = ?').run(playbook);
  }
}
