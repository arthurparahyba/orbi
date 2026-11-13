import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, init, Orbi, brain, inbox, components } from './support/flow.ts';

/**
 * A change the developer asks for (docs/funcionalidades/25): it is not held to the steps a review
 * named. Without `asked` the scope still refuses, and says how; with it, the card shows the request.
 */
const steps = (b: string) => [{ id: 'a', label: 'Abrir', how: 'abrir o site' }, { id: 'b', label: 'Gravar', how: b }];
const learn = (b: string, asked?: string) => ({
  reason: 'pedido do desenvolvedor',
  ...(asked ? { asked } : {}),
  items: [{ kind: 'playbook', payload: { ...brain.playbook('promo')!, steps: steps(b) } }],
});

test('mudança pedida pelo desenvolvedor: passa pelo escopo da revisão e o cartão mostra o pedido', async () => {
  const id = 'chat:pedido-mudanca';
  brain.savePlaybook({ name: 'promo', description: 'Consulta promoções', appliesTo: null, trigger: 'pedirem promoções', autonomy: 'ask', steps: steps('gravar em promo.html'), instructions: '', learnedFrom: null, variationOf: null, outputs: [] });
  brain.review.scopeChange('promo', ['a'], null, id);

  let refusal = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', learn('gravar em promo-DATA.html') as never), { stopReason: 'toolUse' }),
    (context) => {
      refusal = JSON.stringify(context);
      return fauxAssistantMessage(fauxToolCall('brain_learn', learn('gravar em promo-DATA.html', 'muda o passo b pra gravar com a data no nome') as never), { stopReason: 'toolUse' });
    },
  ]);
  const orbi = init(Orbi, { id });
  const out = await orbi.read(await orbi.dispatch('muda o passo b pra gravar com a data no nome'));
  assert.match(refusal, /a revisão pediu para mudar só os passos a/, 'sem asked, o escopo da revisão recusa');
  assert.match(refusal, /passe o pedido dele em `asked`/, 'e diz como seguir');
  const card = components(out).find((c: any) => c.component === 'approval') as any;
  assert.ok(card, 'com asked, vira cartão');
  const item = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  assert.match(item.detail, /"asked": "muda o passo b/);
  assert.equal(brain.playbook('promo')!.steps[1].how, 'gravar em promo.html', 'nada muda antes de aprovar');
});
