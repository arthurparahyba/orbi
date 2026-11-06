import type { DatabaseSync } from 'node:sqlite';
import type { ConversationUsage, UsageReport, UsageTotals } from '@orbi/contracts';

export type { ConversationUsage, UsageReport, UsageTotals };

/** One model call, as Flue reports it (the `turn` event). */
export interface TurnRecord {
  conversationId: string;
  model: string;
  durationMs: number;
  failed: boolean;
  tokensIn?: number;
  tokensOut?: number;
  cacheRead?: number;
  cacheWrite?: number;
  costUsd?: number;
  at?: Date;
}

/** One tool call (the `tool` event). */
export interface ToolRecord {
  conversationId: string;
  durationMs: number;
  failed: boolean;
  at?: Date;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

const TOTALS_SQL = `COALESCE(SUM(turns),0) turns, COALESCE(SUM(failed_turns),0) failedTurns,
  COALESCE(SUM(tokens_in),0) tokensIn, COALESCE(SUM(tokens_out),0) tokensOut,
  COALESCE(SUM(cache_read),0) cacheRead, COALESCE(SUM(cache_write),0) cacheWrite,
  COALESCE(SUM(cost_usd),0) costUsd, COALESCE(SUM(model_ms),0) modelMs,
  COALESCE(SUM(tool_calls),0) toolCalls, COALESCE(SUM(failed_tools),0) failedTools, COALESCE(SUM(tool_ms),0) toolMs`;

const totals = (row: Record<string, unknown>): UsageTotals => ({
  turns: Number(row.turns), failedTurns: Number(row.failedTurns),
  tokensIn: Number(row.tokensIn), tokensOut: Number(row.tokensOut),
  cacheRead: Number(row.cacheRead), cacheWrite: Number(row.cacheWrite),
  costUsd: Number(row.costUsd), modelMs: Number(row.modelMs),
  toolCalls: Number(row.toolCalls), failedTools: Number(row.failedTools), toolMs: Number(row.toolMs),
});

/**
 * Usage per conversation and per day, summed as it happens (telemetry.ts
 * feeds it from Flue's events). Cost is Flue's estimate from the model
 * catalog; adapters that report no usage show tokens and cost as zero.
 */
export class UsageStore {
  constructor(private readonly db: DatabaseSync) {}

  recordTurn(t: TurnRecord): void {
    const at = t.at ?? new Date();
    this.db
      .prepare(
        `INSERT INTO usage (conversation_id, day, model, turns, failed_turns, tokens_in, tokens_out, cache_read, cache_write, cost_usd, model_ms, last_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (conversation_id, day) DO UPDATE SET
           model = excluded.model, turns = turns + 1, failed_turns = failed_turns + excluded.failed_turns,
           tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out,
           cache_read = cache_read + excluded.cache_read, cache_write = cache_write + excluded.cache_write,
           cost_usd = cost_usd + excluded.cost_usd, model_ms = model_ms + excluded.model_ms, last_at = excluded.last_at`,
      )
      .run(
        t.conversationId, day(at), t.model, t.failed ? 1 : 0, t.tokensIn ?? 0, t.tokensOut ?? 0,
        t.cacheRead ?? 0, t.cacheWrite ?? 0, t.costUsd ?? 0, Math.round(t.durationMs), at.toISOString(),
      );
  }

  recordTool(t: ToolRecord): void {
    const at = t.at ?? new Date();
    this.db
      .prepare(
        `INSERT INTO usage (conversation_id, day, tool_calls, failed_tools, tool_ms, last_at) VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT (conversation_id, day) DO UPDATE SET
           tool_calls = tool_calls + 1, failed_tools = failed_tools + excluded.failed_tools,
           tool_ms = tool_ms + excluded.tool_ms, last_at = excluded.last_at`,
      )
      .run(t.conversationId, day(at), t.failed ? 1 : 0, Math.round(t.durationMs), at.toISOString());
  }

  /** The last `days` days (today included): totals, today, and each conversation, most expensive first. */
  report(days = 30, now = new Date()): UsageReport {
    const since = day(new Date(now.getTime() - (days - 1) * 86_400_000));
    const period = this.db.prepare(`SELECT ${TOTALS_SQL} FROM usage WHERE day >= ?`).get(since) as Record<string, unknown>;
    const today = this.db.prepare(`SELECT ${TOTALS_SQL} FROM usage WHERE day = ?`).get(day(now)) as Record<string, unknown>;
    const rows = this.db
      .prepare(
        `SELECT u.conversation_id id, COALESCE(c.title, u.conversation_id) title, MAX(u.last_at) lastAt,
           (SELECT model FROM usage x WHERE x.conversation_id = u.conversation_id AND x.model <> '' ORDER BY x.last_at DESC LIMIT 1) model,
           ${TOTALS_SQL}
         FROM usage u LEFT JOIN conversations c ON c.id = u.conversation_id
         WHERE u.day >= ? GROUP BY u.conversation_id ORDER BY costUsd DESC, lastAt DESC LIMIT 100`,
      )
      .all(since) as Array<Record<string, unknown>>;
    return {
      days,
      since,
      today: totals(today),
      period: totals(period),
      conversations: rows.map((r) => ({
        conversationId: String(r.id), title: String(r.title), model: String(r.model ?? ''), lastAt: String(r.lastAt), ...totals(r),
      })),
    };
  }
}
