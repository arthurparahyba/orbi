import type { PlaybookRepo } from '../../../procedures/index.ts';
import type { Entity } from '../../../../language/index.ts';
import type { PlaybookRun } from '../../../../language/index.ts';
import { asKnownProblem, problemsIn, recurrence, type KnownProblem } from '../../../knowledge/index.ts';
import { CHANGE_SCOPE_MS, type ReviewNote, type ReviewNoteStatus } from '../../judge/src/judge.ts';
import type { ReviewNoteRepo } from './notes-repo.ts';

/** What the notes need: their own storage, the procedure they are about, and the fact they cite. */
export interface NotesDeps {
  notes: ReviewNoteRepo;
  /** `procedures`: a note is about a step of a procedure. */
  playbooks: PlaybookRepo;
  /** `knowledge`: a note may cite the fact it came from. */
  entity(id: string): Entity | undefined;
}

/**
 * What the end-of-run review keeps (docs/funcionalidades/19): ideas not worth a change now, the
 * environment fixes proposed to the developer, and the scope of a change it asked for (the steps
 * the Orbi may touch when it proposes the fix).
 */
export class Review {
  constructor(private readonly d: NotesDeps) {}

  /** An idea for a procedure: once per subject; seen again, it counts one more time. */
  keepIdea(playbook: string, analyzer: string, text: string, runId: string | null, conversationId: string): ReviewNote {
    const same = this.d.notes.latest(playbook, 'idea', analyzer);
    if (same && same.status === 'kept') return this.d.notes.again(same.id, text, runId);
    return this.d.notes.insert({ playbook, kind: 'idea', subject: analyzer, text, runId, conversationId, status: 'kept' });
  }

  /** The developer was asked to fix this problem at the root and has not said it is done. */
  environmentAsked(playbook: string, problemId: string): boolean {
    const last = this.d.notes.latest(playbook, 'environment', problemId);
    return !!last && (last.status === 'open' || last.status === 'dismissed');
  }

  askEnvironment(playbook: string, problem: KnownProblem, runs: number, runId: string | null, conversationId: string): ReviewNote {
    const text = `${problem.sintoma} (em ${runs} execuções seguidas)`;
    return this.d.notes.insert({ playbook, kind: 'environment', subject: problem.id, text, runId, conversationId, status: 'open' });
  }

  /** The steps the Orbi may change in the fix this review asked for. */
  scopeChange(playbook: string, steps: string[], runId: string | null, conversationId: string): ReviewNote {
    for (const open of this.d.notes.list({ playbook, kind: 'change', status: 'open' })) this.d.notes.setStatus(open.id, 'applied');
    return this.d.notes.insert({ playbook, kind: 'change', subject: JSON.stringify(steps), text: steps.join(', '), runId, conversationId, status: 'open' });
  }

  /** The scope of a change the review asked for in this conversation, recently (an empty list does not limit the steps). */
  changeScope(playbook: string, conversationId: string, at = Date.now()): string[] | undefined {
    const open = this.d.notes.list({ playbook, kind: 'change', status: 'open' })[0];
    if (!open || open.conversationId !== conversationId || at - Date.parse(open.createdAt) > CHANGE_SCOPE_MS) return undefined;
    return JSON.parse(open.subject) as string[];
  }

  /** The change was saved: its scope no longer holds. */
  changeApplied(playbook: string): void {
    for (const open of this.d.notes.list({ playbook, kind: 'change', status: 'open' })) this.d.notes.setStatus(open.id, 'applied');
  }

  /** The known problems a run ran into, with how many of the procedure's runs in a row had them. */
  recurringIn(run: PlaybookRun): Array<{ problem: KnownProblem; runs: number }> {
    const ids = problemsIn(run);
    if (ids.size === 0) return [];
    const history = this.d.playbooks.finishedOf(run.playbook, 10);
    const out: Array<{ problem: KnownProblem; runs: number }> = [];
    for (const id of ids) {
      const entity = this.d.entity(id);
      const problem = entity && asKnownProblem(entity);
      if (problem) out.push({ problem, runs: recurrence(history, id) });
    }
    return out;
  }

  notes(filter: { playbook?: string; kind?: ReviewNote['kind']; status?: ReviewNoteStatus } = {}): ReviewNote[] {
    return this.d.notes.list(filter);
  }

  note(id: string): ReviewNote | undefined {
    return this.d.notes.get(id);
  }

  setStatus(id: string, status: ReviewNoteStatus): ReviewNote | undefined {
    return this.d.notes.setStatus(id, status);
  }
}
