/**
 * Shared setup of the flow tests (test/flow-*.test.ts): the real Flue runtime with Pi's faux
 * provider standing in for the model (scripted responses, no API key), driven through the same
 * HTTP routes the desktop app uses. Each flow file runs in its own process with its own data
 * folder, so a review running in the background of one scenario never takes another's response.
 */
import { before, after } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'orbi-flow-'));
Object.assign(process.env, {
  ORBI_DATA_DIR: dataDir,
  ORBI_WORKSPACE: dataDir,
  CHROME_MCP_AUTOSTART: 'false',
  CHROME_MCP_PORT: '1', // nothing listens: the optional MCP mount degrades gracefully
  ANTHROPIC_API_KEY: 'faux',
});

const pi = await import('@earendil-works/pi-ai');
export const { fauxAssistantMessage, fauxToolCall, fauxText } = pi;
const flueRuntime = await import('@flue/runtime');
export const { init } = flueRuntime;
const { start } = await import('@flue/runtime/node');
export const { Orbi } = await import('../../src/agents/orbi.ts');
export const { default: app } = await import('../../src/app.ts');
export const { brain, inbox } = (await import('../../src/services.ts')).services();
export const { stepClaimProblems: stepClaimProblemsOf } = await import('../../src/brain/domain/review.ts');

export const faux = pi.fauxProvider({ provider: 'anthropic', models: [{ id: 'claude-haiku-5-5', reasoning: true, contextWindow: 200_000 }] });
flueRuntime.setProvider(faux.provider);

// app.ts runs startBackground: tool outcomes and the review at the end of each turn are wired.
let flue: { [Symbol.asyncDispose](): Promise<void> };
before(async () => {
  flue = (await start({ agents: [Orbi] })) as never;
});
after(async () => {
  await flue[Symbol.asyncDispose]();
});

export const conversation = 'chat:teste-fluxo';

/** Components of the last `ui` data part of a reply (the part carries the full list). */
export function components(reply: { data: Record<string, unknown[]> }): any[] {
  const parts = (reply.data.ui ?? []) as Array<{ components: unknown[] }>;
  return parts.at(-1)?.components ?? [];
}

export const playbook = {
  name: 'versao-no-portal',
  description: 'Atualizar a versão de um front-end no Portal interno depois do deploy em dev.',
  appliesTo: 'FrontEnd',
  trigger: 'deploy de um front concluído em dev',
  autonomy: 'auto',
  steps: [
    { id: 'abrir', label: 'Abrir o portal', how: 'mcp__chrome__navigate_page na URL do portal' },
    { id: 'salvar', label: 'Trocar a versão e salvar', how: 'browser_act fill + click; conferir no snapshot' },
  ],
  instructions: 'Use a sessão do Chrome. Se pedir login, pergunte ao desenvolvedor.',
};

/** Waits until `ok()` holds (a background review, a level settled), or fails saying what did not happen. */
export async function waitFor(ok: () => boolean, what: string, ms = 5000): Promise<void> {
  for (let i = 0; i < ms / 50 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
  if (!ok()) throw new Error(`não aconteceu: ${what}`);
}
