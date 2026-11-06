/**
 * The whole learn → approve → run loop through the real Flue runtime, with Pi's
 * faux provider standing in for Claude Haiku 5.5 (scripted responses, no API key).
 * It drives the agent through the same HTTP routes the desktop app uses.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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

const { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } = await import('@earendil-works/pi-ai');
const { setProvider, init } = await import('@flue/runtime');
const { start } = await import('@flue/runtime/node');
const { Orbi } = await import('../src/agents/orbi.ts');
const { default: app } = await import('../src/app.ts');
const { brain, inbox } = (await import('../src/services.ts')).services();

const faux = fauxProvider({ provider: 'anthropic', models: [{ id: 'claude-haiku-5-5', reasoning: true, contextWindow: 200_000 }] });
setProvider(faux.provider);

let flue: { [Symbol.asyncDispose](): Promise<void> };
before(async () => {
  flue = (await start({ agents: [Orbi] })) as never;
});
after(async () => {
  await flue[Symbol.asyncDispose]();
});

const conversation = 'chat:teste-fluxo';

/** Components of the last `ui` data part of a reply (the part carries the full list). */
function components(reply: { data: Record<string, unknown[]> }): any[] {
  const parts = (reply.data.ui ?? []) as Array<{ components: unknown[] }>;
  return parts.at(-1)?.components ?? [];
}

const playbook = {
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

test('aprender: brain_learn fica pendente até o desenvolvedor aprovar', async () => {
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall('brain_learn', {
        reason: 'Arthur ensinou a atualizar a versão no portal',
        items: [
          { kind: 'entity', payload: { id: 'FrontEnd', type: 'Classe', props: { requires: ['registradoEm'] } } },
          { kind: 'entity', payload: { id: 'portal-interno', type: 'Portal', props: { url: 'http://portal.local/admin/menus' } } },
          { kind: 'entity', payload: { id: 'novo-front', type: 'Repositorio' } },
          { kind: 'edge', payload: { from: 'novo-front', rel: 'eUm', to: 'FrontEnd' } },
          { kind: 'playbook', payload: playbook },
        ],
      }),
      { stopReason: 'toolUse' },
    ),
  ]);

  const orbi = init(Orbi, { id: conversation });
  const reply = await orbi.read(await orbi.dispatch('Vou te ensinar a atualizar a versão do front no portal.'));

  assert.equal(brain.playbook('versao-no-portal'), undefined, 'nada é gravado antes da aprovação');
  const card = components(reply).find((p: any) => p.component === 'approval') as any;
  assert.ok(card, 'a conversa recebeu um card de aprovação');
  const item = inbox.list({ status: 'open' }).find((i) => i.kind === 'learning');
  assert.ok(item, 'o aprendizado entrou na caixa "Pedem sua atenção"');
  assert.equal(card.inboxId, item.id);

  // The developer approves through the same route the app calls.
  faux.setResponses([fauxAssistantMessage(fauxText('Guardei o playbook versao-no-portal.'))]);
  const res = await app.request(`/api/inbox/${item.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'approve', approver: 'Arthur' }),
  });
  assert.equal(res.status, 202);
  const receipt = await res.json();
  const after = await orbi.read(receipt);
  assert.match(after.text, /Guardei/);

  assert.ok(brain.playbook('versao-no-portal'), 'playbook gravado no cérebro');
  assert.equal(brain.get('novo-front')?.type, 'Repositorio');
  assert.deepEqual(brain.gaps(), [{ entity: 'novo-front', type: 'Repositorio', missing: 'registradoEm' }],
    'a regra da classe FrontEnd aponta a lacuna: em qual portal o novo-front aparece?');
});

test('executar: o playbook aprendido aparece como skill e vira um passo a passo', async () => {
  faux.setResponses([
    (context) => {
      // The learned playbook is in the system prompt's skill catalog.
      assert.match(JSON.stringify(context), /versao-no-portal/);
      return fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'versao-no-portal', target: 'novo-front' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done', note: 'portal aberto' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'salvar', status: 'done', note: 'versão 0.1.0 salva' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Versão do novo-front atualizada no portal.')),
  ]);

  const orbi = init(Orbi, { id: 'chat:teste-execucao' });
  const reply = await orbi.read(await orbi.dispatch('Atualiza a versão do novo-front no portal.'));

  const run = brain.runs()[0];
  assert.equal(run.playbook, 'versao-no-portal');
  assert.equal(run.status, 'done');
  const steppers = components(reply).filter((p: any) => p.component === 'stepper') as any[];
  // One stepper (same id) updated in place as each step finished.
  assert.equal(steppers.length, 1);
  const last = steppers[0];
  assert.equal(last.status, 'done', 'o passo a passo chegou ao fim');
  assert.deepEqual(last.steps.map((s: any) => s.status), ['done', 'done']);
  assert.equal(brain.playbook('versao-no-portal')?.successes, 1);
});

test('agendar retorno: o Orbi encerra o turno e é acordado depois', async () => {
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('schedule_followup', { minutes: 5, note: 'conferir o run 123 do ci.yml' }), { stopReason: 'toolUse' }),
  ]);
  const orbi = init(Orbi, { id: 'chat:teste-retorno' });
  await orbi.read(await orbi.dispatch('Acompanha o CI do api-pagamentos.'));
  const later = new Date(Date.now() + 6 * 60_000).toISOString();
  const due = brain.claimDueFollowups(later);
  assert.equal(due.length, 1);
  assert.equal(due[0].conversationId, 'chat:teste-retorno');
  assert.equal(brain.claimDueFollowups(later).length, 0, 'cada retorno dispara uma vez só');
});
