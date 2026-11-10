import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, components } from './support/flow.ts';

/** The rehearsal (docs/funcionalidades/18): try out what was explained, agree start and end, then the card. */

const learnWith = (testedRun: string) => ({
  reason: 'Arthur ensinou a gerar o relatório de preços',
  items: [
    {
      kind: 'playbook',
      payload: {
        name: 'relatorio-precos', description: 'Levanta preços em promoção e gera a página', trigger: 'pedido de preços em promoção',
        instructions: '', testedRun,
        steps: [{ id: 'buscar', label: 'Buscar os produtos em promoção', how: 'navegador na loja' }, { id: 'pagina', label: 'Gerar a página', how: 'escrever o HTML' }],
      },
    },
  ],
});

test('ensaio: tenta junto, relata cada parte, combina início e fim; o cartão leva o ensaio', async () => {
  let runId = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('rehearsal_start', { goal: 'relatório de preços em promoção' }), { stopReason: 'toolUse' }),
    (context) => {
      runId = /"runId":"([^"]+)"/.exec(JSON.stringify(context).replace(/\\"/g, '"'))?.[1] ?? '';
      return fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Abrir a loja e a categoria informática', status: 'done', note: 'a categoria se chama "Informática e acessórios"' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Filtrar promoções', status: 'done', note: 'filtro "Ofertas", não "Promoção"' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('rehearsal_finish', {
      start: 'alguém pede os preços em promoção de uma categoria',
      receives: ['categoria'],
      end: 'a página com a lista foi gerada',
      outside: ['comprar'],
      corrections: [{ explained: 'filtro Promoção', actual: 'filtro Ofertas' }],
    }), { stopReason: 'toolUse' }),
  ]);
  const orbi = init(Orbi, { id: 'chat:ensaio' });
  const reply = await orbi.read(await orbi.dispatch('Te ensino: entra na loja, categoria informática, filtra Promoção e monta uma página com os preços.'));

  assert.ok(runId, 'o ensaio começou');
  const run = brain.run(runId)!;
  assert.equal(run.kind, 'rehearsal');
  assert.equal(run.status, 'done');
  assert.deepEqual(run.steps.map((s) => s.status), ['done', 'done']);
  const agreement = components(reply).find((p: any) => p.component === 'agreement') as any;
  assert.ok(agreement, 'o fim mostra o acordo para confirmar');
  assert.equal(agreement.corrections[0].actual, 'filtro Ofertas');
  assert.equal(inbox.get(agreement.inboxId)?.kind, 'question');
  const stepper = components(reply).find((p: any) => p.component === 'stepper') as any;
  assert.match(stepper.title, /Ensaio/);

  // Confirmed: the learning card carries the rehearsal; a made-up one is refused before any card.
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', learnWith('nao-existe')), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /testedRun: a execução nao-existe não existe/);
      return fauxAssistantMessage(fauxToolCall('brain_learn', learnWith(runId)), { stopReason: 'toolUse' });
    },
  ]);
  const answer = await app.request(`/api/inbox/${agreement.inboxId}/answer`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Está certo' }),
  });
  assert.equal(answer.status, 202);
  const after = await orbi.read(await answer.json());
  const card = components(after).find((p: any) => p.component === 'approval') as any;
  assert.ok(card);
  assert.equal(JSON.parse(card.detail).items[0].payload.testedRun, runId);

  faux.setResponses([fauxAssistantMessage(fauxText('Guardado.'))]);
  const item = inbox.list({ status: 'open' }).find((i) => i.kind === 'learning')!;
  await orbi.read(await (await app.request(`/api/inbox/${item.id}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve', approver: 'Arthur' }),
  })).json());
  assert.equal(brain.playbook('relatorio-precos')?.testedRun, runId);
  assert.equal(brain.playbook('relatorio-precos')?.uses, 0, 'o ensaio não conta como uso do procedimento');
});

test('ensaio: o que publica pede aprovação mesmo com a categoria em automático', async () => {
  const { policy } = (await import('../src/services.ts')).services();
  policy.set('navegador-escrita', 'auto');
  try {
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('rehearsal_start', { goal: 'publicar versão' }), { stopReason: 'toolUse' }),
      fauxAssistantMessage(fauxToolCall('browser_act', { tool: 'click', args: { uid: '1_2', pageId: 1 }, purpose: 'Confirmar o release' }), { stopReason: 'toolUse' }),
    ]);
    const orbi = init(Orbi, { id: 'chat:ensaio-publica' });
    const reply = await orbi.read(await orbi.dispatch('Te ensino a publicar a versão no portal.'));
    const card = components(reply).find((p: any) => p.component === 'approval') as any;
    assert.ok(card, 'no ensaio, o clique que publica espera o desenvolvedor');
    assert.equal(card.effect, 'publica');
  } finally {
    policy.set('navegador-escrita', 'ask');
  }
});
