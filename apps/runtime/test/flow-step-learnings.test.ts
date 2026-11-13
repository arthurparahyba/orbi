import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox } from './support/flow.ts';

/**
 * Learnings of a procedure (docs/funcionalidades/25), with the real Flue and a scripted model:
 * a denied change is remembered and not proposed again; what the approved card says the run
 * taught is kept; the next run starts knowing it.
 */
const json = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const steps = (extrair: string) => [{ id: 'abrir', label: 'Abrir', how: 'abrir o site' }, { id: 'extrair', label: 'Extrair', how: extrair }];
const learn = (extrair: string, learnings?: unknown[]) => ({
  reason: 'corrigir a extração',
  items: [{ kind: 'playbook', payload: { ...brain.playbook('promo')!, steps: steps(extrair), ...(learnings ? { learnings } : {}) } }],
}) as never;

test('aprendizados: proposta negada não volta; o que a execução ensinou fica no procedimento e chega à próxima', async () => {
  const id = 'chat:aprendizados';
  brain.savePlaybook({ name: 'promo', description: 'Consulta promoções', appliesTo: null, trigger: 'pedirem promoções', autonomy: 'ask', steps: steps('ler a página'), instructions: '', learnedFrom: null, variationOf: null, outputs: [] });
  const orbi = init(Orbi, { id });

  // Denied: remembered with the procedure.
  faux.setResponses([fauxAssistantMessage(fauxToolCall('brain_learn', learn('Extrair em lotes de 20 itens e juntar com juntar_lotes.py')), { stopReason: 'toolUse' })]);
  await orbi.read(await orbi.dispatch('corrige a extração'));
  const card = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  faux.setResponses([fauxAssistantMessage(fauxText('Certo, não mudo.'))]);
  await orbi.read(await (await app.request(`/api/inbox/${card.id}/decision`, json({ decision: 'deny' }))).json());
  assert.deepEqual(brain.learnings.list('promo').map((l) => [l.step, l.outcome]), [['extrair', 'negado']]);

  // The same idea again: back to the model before any card; another one becomes a card, with what the run taught.
  let refusal = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', learn('extrair em lotes de 20 itens, juntar com juntar_lotes.py')), { stopReason: 'toolUse' }),
    (context) => {
      refusal = JSON.stringify(context);
      return fauxAssistantMessage(fauxToolCall('brain_learn', learn('ignorar patrocinados e repetidos pelo código do produto', [
        { step: 'extrair', tried: 'pegar todos os cards da página', outcome: 'falhou', why: 'vinham patrocinados' },
        { step: 'extrair', tried: 'ignorar patrocinados e repetidos pelo código do produto', outcome: 'funcionou' },
      ])), { stopReason: 'toolUse' });
    },
  ]);
  await orbi.read(await orbi.dispatch('tenta de novo'));
  assert.match(refusal, /promo, passo extrair: isso já foi tentado em .* e foi negado pelo desenvolvedor/);
  const second = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  faux.setResponses([fauxAssistantMessage(fauxText('Guardado.'))]);
  await orbi.read(await (await app.request(`/api/inbox/${second.id}/decision`, json({ decision: 'approve' }))).json());
  assert.deepEqual(brain.learnings.list('promo').map((l) => l.outcome).sort(), ['falhou', 'funcionou', 'negado']);

  // The next run starts with it.
  let started = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'promo' }), { stopReason: 'toolUse' }),
    (context) => { started = JSON.stringify(context); return fauxAssistantMessage(fauxText('Começando.')); },
  ]);
  const next = init(Orbi, { id: 'chat:aprendizados-2' });
  await next.read(await next.dispatch('consulta as promoções'));
  assert.match(started, /jaTentado/);
  assert.match(started, /passo extrair · negado pelo desenvolvedor: Extrair em lotes/);

  const list = await (await app.request('/api/step-learnings?playbook=promo')).json() as Array<{ id: string }>;
  assert.equal(list.length, 3);
  assert.equal((await app.request(`/api/step-learnings/${list[0].id}`, { method: 'DELETE' })).status, 200);
  assert.equal(brain.learnings.list('promo').length, 2);
});
