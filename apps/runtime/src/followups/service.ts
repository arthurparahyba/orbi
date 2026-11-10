import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import { afterFailedDelivery, isActive, type Followup } from './domain.ts';
import { FollowupRepo } from './repo.ts';

const now = () => new Date().toISOString();

/**
 * The owner of follow-ups: scheduling (one active per conversation), cancelling, and the states a
 * delivery goes through. The tools, the prompt, the routes, the scheduler and the "waiting" check
 * all read from here (docs/funcionalidades/11).
 */
export class Followups {
  private readonly repo: FollowupRepo;

  constructor(db: DatabaseSync) {
    this.repo = new FollowupRepo(db);
  }

  /** Schedules one; an active one in the same conversation is replaced (and returned, to say so). */
  schedule(input: { conversationId: string; minutes: number; note: string; runId?: string | null; stepId?: string | null }, at = new Date()): { followup: Followup; replaced?: Followup } {
    if (!(input.minutes >= 1 && input.minutes <= 1440)) throw new Error('o retorno vai de 1 minuto a 24 horas');
    if (!input.note.trim()) throw new Error('diga o que conferir no retorno');
    const before = this.repo.active(input.conversationId);
    if (before) this.repo.save({ ...before, status: 'cancelled', cancelledBy: 'substituido' });
    const followup: Followup = {
      id: ulid(),
      conversationId: input.conversationId,
      dueAt: new Date(at.getTime() + input.minutes * 60_000).toISOString(),
      note: input.note.trim(),
      status: 'scheduled',
      attempts: 0,
      runId: input.runId ?? null,
      stepId: input.stepId ?? null,
      createdAt: at.toISOString(),
    };
    this.repo.insert(followup);
    return { followup, ...(before ? { replaced: before } : {}) };
  }

  active(conversationId: string): Followup | undefined {
    return this.repo.active(conversationId);
  }

  allActive(): Followup[] {
    return this.repo.allActive();
  }

  inConversation(conversationId: string): Followup[] {
    return this.repo.inConversation(conversationId);
  }

  get(id: string): Followup | undefined {
    return this.repo.get(id);
  }

  /** Cancels one that has not been delivered; returns undefined when there was nothing to cancel. */
  cancel(id: string, by: string): Followup | undefined {
    const f = this.repo.get(id);
    if (!f || !isActive(f)) return undefined;
    const cancelled = { ...f, status: 'cancelled' as const, cancelledBy: by };
    this.repo.save(cancelled);
    return cancelled;
  }

  /** The conversation was deleted: what it waited for goes with it. */
  cancelIn(conversationId: string, by: string): void {
    const f = this.repo.active(conversationId);
    if (f) this.cancel(f.id, by);
  }

  // ── the scheduler's side ─────────────────────────────────────────────
  claimDue(at = now()): Followup[] {
    return this.repo.claimDue(at);
  }

  delivered(f: Followup): void {
    this.repo.save({ ...f, status: 'delivered', deliveredAt: now() });
  }

  /** A delivery that failed: back to scheduled for the next tick, or failed for good. */
  deliveryFailed(f: Followup, error: string): Followup {
    const next = afterFailedDelivery(f, error);
    this.repo.save(next);
    return next;
  }

  recoverInterrupted(): number {
    return this.repo.recoverInterrupted();
  }
}
