import { ulid } from 'ulidx';
import { type DueFollowup } from '../repo/followups.ts';
import { now } from '../repo/rows.ts';
import type { BrainParts } from './parts.ts';
import type { BrainStore } from '../store.ts';

/** Follow-ups the Orbi scheduled for itself. */
export class Agenda {
  constructor(private readonly p: BrainParts, private readonly brain: BrainStore) {}

  // ── follow-ups ──────────────────────────────────────────────────────────
  hasScheduledFollowup(conversationId: string): boolean {
    return this.p.followups.scheduledIn(conversationId);
  }

  scheduleFollowup(conversationId: string, dueAt: string, note: string): string {
    const id = ulid();
    this.p.followups.schedule(id, conversationId, dueAt, note);
    return id;
  }

  claimDueFollowups(at = now()): DueFollowup[] {
    return this.p.followups.claimDue(at);
  }
}
