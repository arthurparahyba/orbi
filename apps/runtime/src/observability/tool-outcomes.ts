/**
 * The last tool call of each conversation and whether it failed (fed by telemetry.ts). A playbook
 * step is not accepted as done right after its tool failed: the model fixes it, or reports the step
 * as failed or skipped. Kept in memory: it only matters within a turn.
 */
export interface ToolOutcome {
  tool: string;
  failed: boolean;
  error?: string;
}

/** Tools that report progress, not work: they never count as the step's last tool. */
const BOOKKEEPING = new Set(['playbook_step', 'playbook_start']);

export class ToolOutcomes {
  private readonly last = new Map<string, ToolOutcome>();

  record(conversationId: string, outcome: ToolOutcome): void {
    if (BOOKKEEPING.has(outcome.tool)) return;
    this.last.set(conversationId, outcome);
    if (this.last.size > 500) this.last.delete(this.last.keys().next().value!);
  }

  lastIn(conversationId: string): ToolOutcome | undefined {
    return this.last.get(conversationId);
  }

  clear(conversationId: string): void {
    this.last.delete(conversationId);
  }
}
