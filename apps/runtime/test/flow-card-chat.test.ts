import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, components } from './support/flow.ts';

/**
 * Conversation inside a card (docs/funcionalidades/21), with the real Flue and a scripted model:
 * the why shows in the card; a message written in the card reaches the Orbi with what the card
 * shows; a change asked there updates the same card (version 2, no new card); approving applies it.
 */
const json = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const learn = (description: string, why: string) => ({
  reason: 'guardar o conceito de loja',
  why,
  items: [{ kind: 'type', payload: { name: 'Loja', description } }],
});

test('cartão: o porquê aparece nele, a conversa chega com o contexto e o ajuste muda o próprio cartão', async () => {
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', learn('Site de compras', 'sem o conceito, cada promoção vira um texto solto')), { stopReason: 'toolUse' }),
  ]);
  const id = 'chat:cartao-conversa';
  const orbi = init(Orbi, { id });
  const first = await orbi.read(await orbi.dispatch('guarda que a loja é um site de compras'));
  const card = components(first).find((c: any) => c.component === 'approval') as any;
  assert.equal(card?.why, 'sem o conceito, cada promoção vira um texto solto', 'o porquê vai no cartão');
  const item = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  assert.equal(card.inboxId, item.id);

  // A question inside the card: the Orbi gets the text and what the card shows (from the inbox).
  let seen = '';
  faux.setResponses([(context) => {
    seen = JSON.stringify(context);
    return fauxAssistantMessage(fauxText('Porque as promoções se repetem por loja.'));
  }]);
  const ask = await app.request(`/api/conversations/${encodeURIComponent(id)}/card-message`, json({ card: item.id, title: 'x', context: 'ignorado para aprendizado', text: 'por que guardar isso?' }));
  assert.equal(ask.status, 200);
  await orbi.read(await ask.json());
  assert.match(seen, /Mensagem escrita dentro do cartão/);
  assert.match(seen, /por que guardar isso\?/);
  assert.match(seen, /Site de compras/, 'o que o cartão mostra vem do banco');
  assert.match(seen, /Mensagem feita dentro de um cartão/, 'com a parte do prompt para responder no cartão');

  // A change asked inside the card: brain_learn again updates THIS card.
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', learn('Site de compras com promoções semanais', 'as promoções mudam toda semana')), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Atualizei o cartão: a descrição fala das promoções semanais.')),
  ]);
  const change = await app.request(`/api/conversations/${encodeURIComponent(id)}/card-message`, json({ card: item.id, title: 'x', context: '', text: 'acrescenta que as promoções são semanais' }));
  const second = await orbi.read(await change.json());
  assert.equal(components(second).some((c: any) => c.component === 'approval'), false, 'nenhum cartão novo');
  assert.match(JSON.stringify(second), /Atualizei o cartão/, 'e o Orbi diz o que mudou');
  const open = inbox.list({ status: 'open' }).filter((i) => i.conversationId === id);
  assert.equal(open.length, 1, 'continua uma pendência só');
  assert.equal(open[0]!.version, 2);
  assert.match(open[0]!.detail, /promoções semanais/);
  assert.match(open[0]!.versions![0]!.detail, /"Site de compras"/, 'a versão anterior fica guardada');

  // Approving applies the version on screen.
  faux.setResponses([fauxAssistantMessage(fauxText('Guardado.'))]);
  await orbi.read(await (await app.request(`/api/inbox/${item.id}/decision`, json({ decision: 'approve', approver: 'Arthur' }))).json());
  assert.equal(brain.type('Loja')?.description, 'Site de compras com promoções semanais');

  // Decided: a change asked in the card no longer updates it (a new learning, with its card).
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', learn('Site de compras e cupons', 'cupons também')), { stopReason: 'toolUse' }),
  ]);
  const late = await app.request(`/api/conversations/${encodeURIComponent(id)}/card-message`, json({ card: item.id, title: 'x', context: '', text: 'e os cupons?' }));
  const third = await orbi.read(await late.json());
  assert.ok(components(third).some((c: any) => c.component === 'approval'), 'cartão novo para um decidido');
});
