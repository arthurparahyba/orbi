import { shQuote } from '../terminal/shell.ts';

export const PROMPT_SLOT = '{prompt}';
export const MODEL_SLOT = '{modelo}';

/**
 * The agent's command with the request and the model in it. The request goes where `{prompt}`
 * is, or at the end. With no model, the option that holds `{modelo}` (`--model {modelo}`,
 * `-m={modelo}`) is left out, so the agent uses its default.
 */
export function agentLine(command: string, prompt: string, model?: string | null): string {
  let line = command;
  if (line.includes(MODEL_SLOT)) {
    line = model
      ? line.split(MODEL_SLOT).join(shQuote(model))
      : line.replace(/\s+-{1,2}[\w-]+(?:\s+|=)\{modelo\}/g, '').split(MODEL_SLOT).join('');
  }
  return line.includes(PROMPT_SLOT) ? line.split(PROMPT_SLOT).join(shQuote(prompt)) : `${line} ${shQuote(prompt)}`;
}

/** The program a command runs (its first word). */
export function binaryOf(command: string): string {
  return command.trim().split(/\s+/)[0] ?? '';
}

/** What is wrong with a command before it is saved: one line, one program, a place for the request. */
export function commandProblems(command: string): string[] {
  const problems: string[] = [];
  const c = command.trim();
  if (!c) problems.push('o comando está vazio');
  if (/[\r\n]/.test(c)) problems.push('o comando precisa caber numa linha');
  if (/[;&|`]|\$\(/.test(c.replace(/'[^']*'/g, ''))) problems.push('o comando roda um programa só: sem ;, &&, | ou $(…)');
  if (c.split(PROMPT_SLOT).length > 2) problems.push('{prompt} aparece mais de uma vez');
  return problems;
}
