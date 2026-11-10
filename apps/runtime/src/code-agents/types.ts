/**
 * Coding agents installed on this machine (Claude Code, Cursor, Devin…) that the Orbi asks to
 * investigate or fix code, always in a throwaway copy of the repository. What is registered here
 * is about this machine, not about the developer's work: it lives in the settings tables, not in
 * the brain.
 */

/** What the Orbi asks an agent to do. Each task has its own agent and model. */
export type CodeAgentTask = 'investigar' | 'corrigir';
export const CODE_AGENT_TASKS: readonly CodeAgentTask[] = ['investigar', 'corrigir'];

export type CodeAgentRunIn = 'window' | 'background';

/** Where a registration came from. */
export type CodeAgentSource = 'catalogo' | 'ajuda' | 'manual' | 'env';

export interface CodeAgent {
  /** Short stable id (kebab-case), e.g. `claude-code`. */
  id: string;
  name: string;
  /** The program, first word of the command. */
  binary: string;
  /**
   * The one-shot command line, run in the developer's shell inside the copy. `{prompt}` is where
   * the request goes (else it is appended); `{modelo}` is where the task's model goes (with no
   * model, the option holding it is left out).
   */
  command: string;
  /** Models it accepts, as its option takes them. Empty: it uses its own default. */
  models: string[];
  source: CodeAgentSource;
  /**
   * Where it runs: `window`, a terminal window the developer sees (their own session, so the
   * agent's login works as in their terminal, and they follow it); `background`, hidden.
   */
  runIn: CodeAgentRunIn;
  lastTest: { at: string; ok: boolean; detail: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAssignment {
  task: CodeAgentTask;
  agent: string;
  model: string | null;
}

/** A known agent: how its one-shot mode is called (data, kept in catalog.ts). */
export interface CatalogEntry {
  id: string;
  name: string;
  binary: string;
  command: string;
  models: string[];
  /** What the developer should know (login, limits). */
  note?: string;
}
