import base from '../prompts/orbi/base.md?raw';
import procedimento from '../prompts/orbi/procedimento.md?raw';
import falhas from '../prompts/orbi/falhas.md?raw';
import esteiras from '../prompts/orbi/esteiras.md?raw';
import agentes from '../prompts/orbi/agentes.md?raw';
import correcao from '../prompts/orbi/agentes-de-codigo.md?raw';

/** What the runtime knows about the conversation when the turn starts. */
export interface Situation {
  /** A procedure is running here. */
  activeRun: boolean;
  /** The last tool call of this conversation failed. */
  lastToolFailed: boolean;
  /** How many esteiras exist. */
  pipelines: number;
  /** This conversation is the delivery of an esteira. */
  delivery: boolean;
  /** A coding agent asked for this conversation over MCP. */
  agentRequest: boolean;
  /** A coding agent of this machine can investigate or fix (Autonomia › Agentes de código). */
  codeAgents?: boolean;
}

/** One part of the instructions, sent only when its situation exists. */
export interface PromptPart {
  id: string;
  when(s: Situation): boolean;
  text: string;
}

/**
 * The Orbi's fixed instructions, in parts (prompts/orbi/). The base goes every turn; the others
 * only when the situation they are about exists, so a plain conversation does not carry the
 * rules of esteiras or of agent requests, and rules don't pile up in one text. A new part is a
 * file and one line here. Rules the runtime can check (a step done only if its tool worked,
 * waiting only for what exists) are checked by it, not asked of the model.
 */
export const PROMPT_PARTS: readonly PromptPart[] = [
  { id: 'base', when: () => true, text: base },
  { id: 'procedimento', when: (s) => s.activeRun, text: procedimento },
  { id: 'falhas', when: (s) => s.activeRun || s.lastToolFailed, text: falhas },
  { id: 'esteiras', when: (s) => s.pipelines > 0 || s.delivery, text: esteiras },
  { id: 'agentes', when: (s) => s.agentRequest, text: agentes },
  { id: 'correcao-de-codigo', when: (s) => !!s.codeAgents && (s.activeRun || s.lastToolFailed), text: correcao },
];

export function promptParts(s: Situation, parts: readonly PromptPart[] = PROMPT_PARTS): PromptPart[] {
  return parts.filter((p) => p.when(s));
}

export function composePrompt(s: Situation, parts: readonly PromptPart[] = PROMPT_PARTS): string {
  return promptParts(s, parts).map((p) => p.text.trim()).join('\n\n');
}

/** What a procedure needs to know when it starts (in playbook_start's output: the prompt of this turn didn't have it). */
export const RUN_RULES = `${procedimento.trim()}\n\n${falhas.trim()}`;

/** The same, when a coding agent can fix code here. */
export const RUN_RULES_WITH_CODE = `${RUN_RULES}\n\n${correcao.trim()}`;
