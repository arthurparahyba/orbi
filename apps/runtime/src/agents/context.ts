import type * as v from 'valibot';
import type { UiComponent } from '@orbi/contracts';
import type { AutonomyLevel, Category } from '../autonomy/policy.ts';
import type { Effect } from '../brain/domain/levels.ts';

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
  /** The card's heading in plain words (default: summary). */
  title?: (args: v.InferOutput<T>) => string;
  /** The command or action in one line, shown under the heading. */
  command?: (args: v.InferOutput<T>) => string;
  /** What it does to the world (default: from the category). */
  effect?: (args: v.InferOutput<T>) => Effect;
  /** What makes two calls "the same action" across runs (default: name and arguments, without purpose). */
  fingerprint?: (args: v.InferOutput<T>) => string;
  /** Asks even where the level or the global rule would run it alone (e.g. investigating an error nobody knows). */
  alwaysAsk?: (args: v.InferOutput<T>) => boolean;
  /** Why the Orbi proposes it, one sentence for the card (docs/funcionalidades/21). */
  why?: (args: v.InferOutput<T>) => string | undefined;
  /**
   * The developer chose "sempre sozinho" for this exact tool: where the rule or the level would
   * ask, it runs. Never for what deletes, never where the rule is "observar", never in a rehearsal
   * that publishes. `offer`: the card may offer that choice (an MCP tool that does not delete).
   */
  alone?: () => { set: boolean; offer?: { server: string; tool: string } };
  /** The developer said no to this call: what the tool wants to remember of it (never an effect on the world). */
  denied?: (args: v.InferOutput<T>) => void;
  /** Problems found before deciding (invalid input): the model fixes them; nothing is asked or run. */
  precheck?: (args: v.InferOutput<T>) => string[];
  /** The effect itself: runs now (`auto`), or later when the developer approves (`approved`). */
  /** `signal`: the turn was stopped (the developer clicked Parar): stop what is running. */
  execute: (args: v.InferOutput<T>, approvalId: string, how: 'auto' | 'approved', signal?: AbortSignal) => Promise<string>;
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
