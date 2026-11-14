import type { DatabaseSync } from 'node:sqlite';
import { now, type Row } from './rows.ts';
import type { CallApproval, CallMark, CallStatus, RunCall } from '../domain/run-calls.ts';

/** The most calls kept for one execution; past that the oldest go (the newest matter). */
const MAX_PER_RUN = 400;

const toCall = (r: Row): RunCall => ({
  id: String(r.id),
  runId: (r.run_id as string | null) ?? null,
  conversationId: String(r.conversation_id),
  step: (r.step as string | null) ?? null,
  tool: String(r.tool),
  summary: String(r.summary),
  status: String(r.status) as CallStatus,
  approval: (r.approval as CallApproval | null) ?? null,
  error: String(r.error),
  durationMs: Number(r.duration_ms),
  chars: Number(r.chars),
  marks: (JSON.parse(String(r.marks || '[]')) as CallMark[]) ?? [],
  at: String(r.at),
});

/**
 * What each tool call of an execution did (docs/funcionalidades/24). A call is written when it
 * starts and completed when it ends, so a turn that dies halfway still leaves its trail.
 */
export class RunCallRepo {
  constructor(private readonly db: DatabaseSync) {}

  /** A call started inside an execution. */
  begin(call: { id: string; runId: string; conversationId: string; step: string | null; tool: string; summary: string }): void {
    this.db
      .prepare('INSERT INTO run_calls (id, run_id, conversation_id, step, tool, summary, status, error, duration_ms, chars, marks, at) VALUES (?, ?, ?, ?, ?, ?, \'pediu\', \'\', 0, 0, \'[]\', ?) ON CONFLICT(id) DO NOTHING')
      .run(call.id, call.runId, call.conversationId, call.step, call.tool, call.summary, now());
    const extra = Number((this.db.prepare('SELECT count(*) AS n FROM run_calls WHERE run_id = ?').get(call.runId) as Row).n) - MAX_PER_RUN;
    if (extra > 0) this.db.prepare('DELETE FROM run_calls WHERE id IN (SELECT id FROM run_calls WHERE run_id = ? ORDER BY at, rowid LIMIT ?)').run(call.runId, extra);
  }

  /** The call ended. The step it counted in is the one open when it started, not the one open now: `playbook_step` closes a step, and its own line belongs to the step it closed. */
  finish(id: string, end: { status: CallStatus; approval: CallApproval | null; error?: string; durationMs: number; chars: number; marks: CallMark[]; step?: string | null }): void {
    this.db
      .prepare('UPDATE run_calls SET status = ?, approval = ?, error = ?, duration_ms = ?, chars = ?, marks = ?, step = coalesce(step, ?) WHERE id = ?')
      .run(end.status, end.approval, (end.error ?? '').replace(/\s+/g, ' ').slice(0, 300), end.durationMs, end.chars, JSON.stringify(end.marks), end.step ?? null, id);
  }

  /** The developer decided on a card: the same call, now approved (and run) or denied. */
  decided(id: string, decision: { approval: 'aprovada' | 'negada'; status: CallStatus; error?: string; chars?: number; marks?: CallMark[] }): void {
    const call = this.get(id);
    if (!call) return;
    this.db
      .prepare('UPDATE run_calls SET approval = ?, status = ?, error = ?, chars = ?, marks = ? WHERE id = ?')
      .run(decision.approval, decision.status, (decision.error ?? call.error).replace(/\s+/g, ' ').slice(0, 300), decision.chars ?? call.chars, JSON.stringify(decision.marks ?? call.marks), id);
  }

  get(id: string): RunCall | undefined {
    const r = this.db.prepare('SELECT * FROM run_calls WHERE id = ?').get(id) as Row | undefined;
    return r ? toCall(r) : undefined;
  }

  list(runId: string): RunCall[] {
    return (this.db.prepare('SELECT * FROM run_calls WHERE run_id = ? ORDER BY at, rowid').all(runId) as Row[]).map(toCall);
  }

  /** How many calls, and how much was read, in each of these executions. */
  countsFor(runIds: readonly string[]): Map<string, { calls: number; chars: number; marked: number }> {
    const out = new Map<string, { calls: number; chars: number; marked: number }>();
    if (runIds.length === 0) return out;
    const marks = runIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT run_id, count(*) AS calls, coalesce(sum(chars), 0) AS chars, sum(CASE WHEN marks != '[]' THEN 1 ELSE 0 END) AS marked FROM run_calls WHERE run_id IN (${marks}) GROUP BY run_id`)
      .all(...runIds) as Row[];
    for (const r of rows) out.set(String(r.run_id), { calls: Number(r.calls), chars: Number(r.chars), marked: Number(r.marked) });
    return out;
  }
}
