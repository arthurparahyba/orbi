import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxText, fauxToolCall, init, Orbi, app, brain, inbox } from './support/flow.ts';

/**
 * A procedure only leaves the draft by running as it is written (docs/funcionalidades/25), with the
 * real Flue and a scripted model: the card is not the end, `brain_learn` says so, running it proves
 * each step, and a step whose words change goes back to being a step to prove.
 */
const json = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const steps = (filtrar: string) => [{ id: 'abrir', label: 'Abrir', how: 'abrir o site' }, { id: 'filtrar', label: 'Filtrar', how: filtrar }];
const playbook = (filtrar: string) => ({
  reason: 'aprender o procedimento',
  items: [{ kind: 'playbook', payload: { name: 'promo', description: 'Consulta promoções', trigger: 'pedirem promoções', autonomy: 'ask', instructions: '', steps: steps(filtrar) } }],
}) as never;

test('prova: o cartão deixa o procedimento em rascunho, rodar prova cada passo, e mudar um passo tira a prova dele', async () => {
  const id = 'chat:prova';
  // The card that stores it: the tool says, right there, that it is a draft and how to prove it.
  let afterLearn = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', playbook('clicar no botão Ofertas')), { stopReason: 'toolUse' }),
    (context) => { afterLearn = JSON.stringify(context); return fauxAssistantMessage(fauxText('Guardado; vou rodar para provar.')); },
  ]);
  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('aprende a consultar as promoções'));
  const card = inbox.list({ status: 'open' }).find((i) => i.conversationId === id && i.kind === 'learning')!;
  await orbi.read(await (await app.request(`/api/inbox/${card.id}/decision`, json({ decision: 'approve' }))).json());
  assert.match(afterLearn, /promo está em rascunho/);
  assert.match(afterLearn, /Rode agora com playbook_start/);
  const proofs = async () => (await (await app.request('/api/brain/proofs')).json()) as Record<string, { state: string; label: string; missing: string[] }>;
  assert.equal((await proofs()).promo!.state, 'rascunho');

  // Running it as it is written: each step that closes done proves itself.
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'promo' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'filtrar', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Provado.')),
  ]);
  await orbi.read(await orbi.dispatch('roda para provar'));
  assert.deepEqual((await proofs()).promo, { state: 'provado', missing: [], waived: [], label: 'provado' });

  // The step's words change: its proof goes with them, and the tool says what is missing.
  let afterFix = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', { ...(playbook('usar o filtro "Desconto: 10% ou mais"') as never as Record<string, unknown>), asked: 'muda o filtro para o menu lateral' } as never), { stopReason: 'toolUse' }),
    (context) => { afterFix = JSON.stringify(context); return fauxAssistantMessage(fauxText('Mudei; falta provar.')); },
  ]);
  await orbi.read(await orbi.dispatch('muda o filtro para o menu lateral'));
  const fix = inbox.list({ status: 'open' }).find((i) => i.conversationId === id && i.kind === 'learning')!;
  await orbi.read(await (await app.request(`/api/inbox/${fix.id}/decision`, json({ decision: 'approve' }))).json());
  assert.match(afterFix, /falta provar o passo 2 · Filtrar/);
  assert.deepEqual((await proofs()).promo!.missing, ['filtrar']);

  // "Não provar este passo agora" (a deploy nobody runs to prove a procedure), and the undo.
  const waived = await (await app.request('/api/brain/playbooks/promo/steps/filtrar/waive', { method: 'POST' })).json() as { state: string; label: string };
  assert.equal(waived.state, 'provado');
  assert.match(waived.label, /provado · você dispensou o passo 2 · Filtrar/);
  const back = await (await app.request('/api/brain/playbooks/promo/steps/filtrar/waive', { method: 'DELETE' })).json() as { state: string };
  assert.equal(back.state, 'parcial');
  assert.equal((await app.request('/api/brain/playbooks/promo/steps/nao-existe/waive', { method: 'POST' })).status, 404);
});
