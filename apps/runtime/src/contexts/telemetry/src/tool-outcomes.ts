/**
 * The last tool call of each conversation and whether it failed (fed by telemetry.ts). A playbook
 * step is not accepted as done right after its tool failed: the model fixes it, or reports the step
 * as failed or skipped. Kept in memory: it only matters within a turn.
 */
export interface ToolOutcome {
  tool: string;
  failed: boolean;
  error?: string;
  /** What a successful tool returned (text, cut): what the run read, for the review of knowledge. */
  result?: string;
  /** The tool call's id, and everything it returned to the model: the registry of the execution (docs/funcionalidades/24). */
  id?: string;
  chars?: number;
  durationMs?: number;
}

/** Tools that report progress, not work: they never count as the step's last tool. */
const BOOKKEEPING = new Set(['playbook_step', 'playbook_start']);

export class ToolOutcomes {
  private readonly last = new Map<string, ToolOutcome>();
  /**
   * A call's name and arguments between its start and its end. The registry of the execution
   * (docs/funcionalidades/24) writes its line at the start; a call that opens the execution itself
   * (`playbook_start`) has no run yet when it starts, so its line is written when it lands.
   */
  private readonly starts = new Map<string, { tool: string; summary: string }>();

  startCall(id: string, call: { tool: string; summary: string }): void {
    this.starts.set(id, call);
    if (this.starts.size > 500) this.starts.delete(this.starts.keys().next().value!);
  }

  takeCall(id: string): { tool: string; summary: string } | undefined {
    const call = this.starts.get(id);
    this.starts.delete(id);
    return call;
  }

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
