import type { FoundIn } from '../../../language/index.ts';

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
  private readonly starts = new Map<string, { tool: string; summary: string; origin?: FoundIn }>();
  /**
   * De onde veio a última informação que entrou nesta conversa (documento 28, fase C). Mora aqui,
   * junto da última chamada, porque é a chamada que sabe: quem aprende só colhe.
   */
  private readonly origins = new Map<string, FoundIn>();

  startCall(id: string, call: { tool: string; summary: string; origin?: FoundIn }): void {
    this.starts.set(id, call);
    if (this.starts.size > 500) this.starts.delete(this.starts.keys().next().value!);
  }

  takeCall(id: string): { tool: string; summary: string; origin?: FoundIn } | undefined {
    const call = this.starts.get(id);
    this.starts.delete(id);
    return call;
  }

  /**
   * Uma chamada **que executou** trouxe informação nova do mundo. Nada guardado = segue valendo a
   * anterior. Uma chamada que pediu aprovação e não rodou, ou que falhou, não trouxe nada: não é
   * procedência de nada, e o carimbo não pode acontecer no começo da chamada por isso.
   */
  foundIn(conversationId: string, origin: FoundIn | undefined): void {
    if (!origin) return;
    this.origins.set(conversationId, origin);
    if (this.origins.size > 500) this.origins.delete(this.origins.keys().next().value!);
  }

  /** De onde veio a última informação desta conversa, para quem for guardá-la no cérebro. */
  lastFoundIn(conversationId: string): FoundIn | undefined {
    return this.origins.get(conversationId);
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
    this.origins.delete(conversationId);
  }
}
