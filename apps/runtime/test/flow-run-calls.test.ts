import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxText, fauxToolCall, init, Orbi, app, brain, inbox } from './support/flow.ts';

/**
 * The registry of the execution (docs/funcionalidades/24), with the real Flue and a scripted model:
 * every call of the run is written down with the step it counted in, what it waited for and how
 * much it made the model read; the whole thing comes out as text for whoever debugs it.
 */
const json = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

test('registro: cada chamada da execução, com passo, aprovação e o que foi lido', async () => {
  const id = 'chat:registro';
  brain.savePlaybook({
    name: 'promo', description: 'Consulta promoções', appliesTo: null, trigger: 'pedirem promoções', autonomy: 'ask',
    steps: [{ id: 'abrir', label: 'Abrir', how: 'abrir o site' }, { id: 'extrair', label: 'Extrair', how: 'extrair os produtos' }],
    instructions: '', learnedFrom: null, variationOf: null, outputs: [],
  });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'promo' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'mkdir', args: ['registro-teste'], purpose: 'criar a pasta de saída' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Pasta criada.')),
  ]);
  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('consulta as promoções'));

  const run = brain.runs().find((r) => r.conversationId === id)!;
  const asked = brain.calls.list(run.id).find((c) => c.tool === 'run_command')!;
  assert.equal(asked.status, 'pediu', 'enquanto espera você, fica como pediu');
  assert.equal(asked.approval, 'pedida');
  assert.equal(asked.step, 'extrair', 'contou no passo aberto quando a chamada começou');
  assert.match(asked.summary, /mkdir/);

  const card = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  await orbi.read(await (await app.request(`/api/inbox/${card.id}/decision`, json({ decision: 'approve' }))).json());

  const calls = brain.calls.list(run.id);
  assert.deepEqual(
    calls.map((c) => [c.tool, c.step, c.status, c.approval]),
    [['playbook_start', 'abrir', 'ok', null], ['playbook_step', 'abrir', 'ok', null], ['run_command', 'extrair', 'ok', 'aprovada']],
    'a chamada que abriu a execução entra, o passo fechado fica no passo que fechou, e a aprovada vira aprovada',
  );
  assert.ok(calls[0]!.chars > 0, 'o tamanho do que voltou ao modelo é contado');
  assert.ok(calls.every((c) => c.marks.length === 0), 'nada caro nem cortado nesta execução');

  const fromApi = await (await app.request(`/api/brain/runs/${run.id}/calls`)).json() as Array<{ tool: string }>;
  assert.deepEqual(fromApi.map((c) => c.tool), ['playbook_start', 'playbook_step', 'run_command']);
  const text = await (await app.request(`/api/brain/runs/${run.id}/transcript`)).text();
  assert.match(text, /# promo/);
  assert.match(text, /## 1 · Abrir \(done\)/);
  assert.match(text, /run_command .*mkdir.* → ok · aprovada/);
  assert.equal((await app.request('/api/brain/runs/nao-existe/calls')).status, 404);
});

test('registro: chamada errada do modelo e leitura cara ficam marcadas', async () => {
  const id = 'chat:registro-marcas';
  brain.savePlaybook({
    name: 'ler', description: 'Lê uma saída grande', appliesTo: null, trigger: 'pedirem a saída', autonomy: 'ask',
    steps: [{ id: 'ler', label: 'Ler', how: 'rodar o programa' }], instructions: '', learnedFrom: null, variationOf: null, outputs: [],
  });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'ler' }), { stopReason: 'toolUse' }),
    // Arguments that do not validate: the model's slip, not the step's failure.
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'python3' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'python3', args: ['-c', "print('x' * 30000)"], purpose: 'ler a saída grande' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Li a saída.')),
  ]);
  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('roda o programa'));
  const run = brain.runs().find((r) => r.conversationId === id)!;
  const card = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  await orbi.read(await (await app.request(`/api/inbox/${card.id}/decision`, json({ decision: 'approve' }))).json());

  const calls = brain.calls.list(run.id);
  const wrong = calls.find((c) => c.status === 'erro')!;
  assert.deepEqual(wrong.marks, ['chamada'], 'argumento que não valida é chamada errada');
  assert.match(wrong.error, /purpose/);
  const big = calls.find((c) => c.approval === 'aprovada')!;
  assert.ok(big.chars >= 20_000, `o que voltou ao modelo foi contado: ${big.chars}`);
  assert.ok(big.marks.includes('caro'), `leitura cara: ${JSON.stringify(big.marks)}`);
  // The wrong call does not blame the step (docs/funcionalidades/23).
  assert.deepEqual(brain.run(run.id)!.deviations.map((d) => d.kind), ['chamada']);
});
