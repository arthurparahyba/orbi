import type * as v from 'valibot';
import type { UiComponent } from '@orbi/contracts';
import type { AutonomyLevel, Category } from '../policy/autonomy.ts';

/** The playbook being run in this conversation, if any (persisted across turns). */
export type ActiveRun = { runId: string; playbook: string; autonomy: AutonomyLevel } | null;

/** A tool whose effect passes the autonomy gate (see gate.ts). */
export interface GatedTool<T extends v.GenericSchema<Record<string, unknown>>> {
  name: string;
  description: string;
  input: T;
  /** Which autonomy rule applies to these arguments. */
  category: (args: v.InferOutput<T>) => Category;
  /** One line for the approval card. */
  summary: (args: v.InferOutput<T>) => string;
  /** The effect itself: runs now, or later when the developer approves. */
  execute: (args: v.InferOutput<T>, approvalId: string) => Promise<string>;
  timeoutMs?: number;
}

/** What every capability module receives from the agent (agents/capabilities.ts). */
export interface AgentContext {
  conversationId: string;
  /** Show or update a component in the conversation (ui-channel.ts). */
  ui: (component: UiComponent) => void;
  /** Register a tool behind the autonomy gate (gate.ts). */
  gated: <T extends v.GenericSchema<Record<string, unknown>>>(tool: GatedTool<T>) => void;
  activeRun: ActiveRun;
  setActiveRun: (run: ActiveRun) => void;
}
