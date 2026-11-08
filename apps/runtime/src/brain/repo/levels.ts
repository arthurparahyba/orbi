import type { DatabaseSync } from 'node:sqlite';
import { monotonicFactory } from 'ulidx';

const ulid = monotonicFactory();
import type { RunAction } from '../domain/levels.ts';
import { now, nullable, type Row } from './rows.ts';

export interface KnownAction extends RunAction {
  playbook: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

export interface AutonomyEvent {
  id: string;
  /** `playbook` (its level) or `passage` (an esteira's passage: subject `esteira/etapa`). */
  subjectKind: 'playbook' | 'passage';
  subject: string;
  from: string;
  to: string;
  reason: string;
  conversationId: string | null;
  createdAt: string;
}

const toKnown = (r: Row): KnownAction => ({
  playbook: String(r.playbook),
  fingerprint: String(r.fingerprint),
  tool: String(r.tool),
  effect: String(r.effect) as RunAction['effect'],
  summary: String(r.summary),
  step: nullable(r.step),
  count: Number(r.count),
  firstAt: String(r.first_at),
  lastAt: String(r.last_at),
});

const toEvent = (r: Row): AutonomyEvent => ({
  id: String(r.id),
  subjectKind: String(r.subject_kind) as AutonomyEvent['subjectKind'],
  subject: String(r.subject),
  from: String(r.from_level),
  to: String(r.to_level),
  reason: String(r.reason),
  conversationId: nullable(r.conversation_id),
  createdAt: String(r.created_at),
});

/** What each playbook already did successfully, and how its autonomy changed over time. */
export class LevelRepo {
  constructor(private readonly db: DatabaseSync) {}

  isKnown(playbook: string, fingerprint: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM playbook_known_actions WHERE playbook = ? AND fingerprint = ?').get(playbook, fingerprint);
  }

  learn(playbook: string, actions: RunAction[]): void {
    const at = now();
    const stmt = this.db.prepare(
      `INSERT INTO playbook_known_actions (playbook, fingerprint, tool, effect, summary, step, count, first_at, last_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(playbook, fingerprint) DO UPDATE SET count = count + 1, last_at = excluded.last_at, summary = excluded.summary`,
    );
    for (const a of actions) stmt.run(playbook, a.fingerprint, a.tool, a.effect, a.summary, a.step, at, at);
  }

  known(playbook: string): KnownAction[] {
    return (this.db.prepare('SELECT * FROM playbook_known_actions WHERE playbook = ? ORDER BY first_at').all(playbook) as Row[]).map(toKnown);
  }

  forget(playbook: string): void {
    this.db.prepare('DELETE FROM playbook_known_actions WHERE playbook = ?').run(playbook);
  }

  addEvent(e: Omit<AutonomyEvent, 'id' | 'createdAt'>): AutonomyEvent {
    const event: AutonomyEvent = { ...e, id: ulid(), createdAt: now() };
    this.db
      .prepare('INSERT INTO autonomy_events (id, subject_kind, subject, from_level, to_level, reason, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(event.id, event.subjectKind, event.subject, event.from, event.to, event.reason, event.conversationId, event.createdAt);
    return event;
  }

  events(subjectKind: AutonomyEvent['subjectKind'], subject: string, limit = 20): AutonomyEvent[] {
    return (
      this.db
        .prepare('SELECT * FROM autonomy_events WHERE subject_kind = ? AND subject = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(subjectKind, subject, limit) as Row[]
    ).map(toEvent);
  }
}
