import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, inbox, components } from './support/flow.ts';

test('credencial pela conversa: o cartão guarda no cofre e o Orbi só recebe a referência', async () => {
  const { vault } = (await import('../src/services.ts')).services();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('ask_secret', { name: 'gitlab/token', description: 'Token do GitLab', reason: 'para entrar no GitLab e apagar o repositório' }), { stopReason: 'toolUse' }),
  ]);
  const orbi = init(Orbi, { id: 'chat:teste-credencial' });
  const reply = await orbi.read(await orbi.dispatch('Vou te ensinar a apagar um repositório no GitLab.'));
  const card = components(reply).find((p: any) => p.component === 'secret') as any;
  assert.equal(card?.name, 'gitlab/token');
  const item = inbox.get(card.inboxId)!;
  assert.equal(item.kind, 'secret');

  faux.setResponses([
    (context) => {
      const prompt = JSON.stringify(context);
      assert.match(prompt, /guardou a credencial no cofre: \{\{segredo:gitlab\/token\}\}/);
      assert.equal(prompt.includes('glpat-nao-pode-vazar'), false, 'o valor nunca chega ao modelo');
      return fauxAssistantMessage(fauxText('Credencial pronta, seguindo.'));
    },
  ]);
  const res = await app.request(`/api/inbox/${item.id}/secret`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'gitlab/token', value: 'glpat-nao-pode-vazar', description: 'Token do GitLab' }),
  });
  assert.equal(res.status, 202);
  await orbi.read(await res.json());
  assert.equal(await vault.get('gitlab/token'), 'glpat-nao-pode-vazar');
  assert.equal(inbox.get(item.id)?.answer, '{{segredo:gitlab/token}}', 'a pendência guarda a referência, não o valor');
  const again = await app.request(`/api/inbox/${item.id}/secret`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'gitlab/token', value: 'x' }) });
  assert.equal(again.status, 409);
});
