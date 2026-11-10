import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, components, waitFor } from './support/flow.ts';

/** Procedures over concepts (docs/funcionalidades/18): learned with inputs, passo 0 when running. */

const procedure = {
  name: 'atualizar-versao-mfe',
  description: 'Publica uma versão de um MicroFrontend no portal que o publica',
  trigger: 'pedido para subir versão de um MFE',
  appliesTo: 'MicroFrontend',
  intent: 'Publicar uma Versao de um MicroFrontend em um Ambiente',
  inputs: [{ name: 'mfe', concept: 'MicroFrontend' }, { name: 'versao' }, { name: 'ambiente' }] as Array<Record<string, string>>,
  instructions: '',
  steps: [
    { id: 'abrir', label: 'Abrir o portal de {{mfe}}', how: 'navegador em {{mfe.publicadoPor.endereco}}' },
    { id: 'publicar', label: 'Criar o release {{versao}} em {{ambiente}}', how: 'Releases › Criar release; status verde em até 10 min' },
  ],
};

test('aprender sobre conceitos: o cartão leva intenção, conceitos, fatos, procedimento e o que ficou fora', async () => {
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall('brain_learn', {
        reason: 'Arthur ensinou a subir versão de MFE no portal',
        leftOut: [
          { value: 'checkout-mfe', where: 'fato: é um MicroFrontend' },
          { value: '2.14.0', where: 'entrada versao' },
        ],
        items: [
          { kind: 'type', payload: { name: 'Portal', description: 'Sistema web', props: { endereco: 'URL do portal' } } },
          { kind: 'type', payload: { name: 'MicroFrontend', description: 'Front publicado por um portal', relations: { publicadoPor: 'Portal' }, knows: { achar: 'buscar pelo nome na lista de aplicações' } } },
          { kind: 'entity', payload: { id: 'portal-deploy', type: 'Portal', props: { endereco: 'http://portal.local/apps' } } },
          { kind: 'entity', payload: { id: 'checkout-mfe', type: 'MicroFrontend', aliases: ['checkout'] } },
          { kind: 'edge', payload: { from: 'checkout-mfe', rel: 'publicadoPor', to: 'portal-deploy' } },
          { kind: 'playbook', payload: procedure },
        ],
      }),
      { stopReason: 'toolUse' },
    ),
  ]);
  const orbi = init(Orbi, { id: 'chat:conceitos-aprender' });
  const reply = await orbi.read(await orbi.dispatch('Pra subir versão do checkout-mfe: entra no portal, Releases, cria a 2.14.0.'));
  const card = components(reply).find((p: any) => p.component === 'approval') as any;
  assert.ok(card, 'o lote passou na verificação e virou cartão');
  const detail = JSON.parse(card.detail);
  assert.equal(detail.leftOut.length, 2, 'o cartão mostra para onde foi cada específico');

  faux.setResponses([fauxAssistantMessage(fauxText('Guardado.'))]);
  const item = inbox.list({ status: 'open' }).find((i) => i.kind === 'learning')!;
  await orbi.read(await (await app.request(`/api/inbox/${item.id}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve', approver: 'Arthur' }),
  })).json());
  assert.deepEqual(brain.playbook('atualizar-versao-mfe')?.inputs?.map((i) => i.name), ['mfe', 'versao', 'ambiente']);
  assert.equal(brain.type('MicroFrontend')?.knows?.achar, 'buscar pelo nome na lista de aplicações');
});

test('passo 0: MFE desconhecido é investigado, vira fato, aparece em "Aprendi" e pode ser desfeito', async () => {
  let started: any;
  let review = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'atualizar-versao-mfe', params: { mfe: 'xpto', versao: '1.3.0', ambiente: 'homologação' } }), { stopReason: 'toolUse' }),
    (context) => {
      started = JSON.stringify(context);
      return fauxAssistantMessage(fauxToolCall('playbook_resolve', { input: 'mfe', entity: 'xpto-mfe', relations: [{ rel: 'publicadoPor', to: 'portal-deploy' }] }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done', note: 'portal aberto' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'publicar', status: 'done', note: 'release verde' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Feito: xpto-mfe 1.3.0 em homologação. No portal ele se chama xpto-mfe; guardei.')),
    // The review at the end of the turn (steps given as done without a tool, in this scripted run).
    (context) => {
      review = JSON.stringify(context);
      return fauxAssistantMessage(fauxText('Ok.'));
    },
  ]);
  const orbi = init(Orbi, { id: 'chat:conceitos-xpto' });
  const reply = await orbi.read(await orbi.dispatch('Sobe a 1.3 do xpto em homologação.'));

  const startOut = started.replace(/\\"/g, '"');
  assert.match(startOut, /passo0/, 'o início diz o que resolver');
  assert.match(startOut, /"value":"xpto"/);
  assert.match(startOut, /buscar pelo nome na lista de aplicações/, 'com o jeito de achar do conceito');

  const fact = brain.get('xpto-mfe')!;
  assert.deepEqual(fact.aliases, ['xpto']);
  const run = brain.runs().find((r) => r.conversationId === 'chat:conceitos-xpto')!;
  assert.equal(run.status, 'done');
  assert.equal(run.steps[0].how, 'navegador em http://portal.local/apps', 'o passo foi preenchido depois de resolver');

  const learned = components(reply).find((p: any) => p.component === 'learned_facts') as any;
  assert.ok(learned, 'o fim mostra o que aprendeu sozinho');
  assert.deepEqual(learned.items.map((i: any) => [i.value, i.entity, i.learned]), [['xpto', 'xpto-mfe', 'created']]);

  // The review at the end of the turn runs in the background: wait for it before the next scenario.
  await waitFor(() => review.includes('review'), 'a revisão do fim');
  const res = await app.request(`/api/brain/runs/${run.id}/resolved/mfe/undo`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal(brain.get('xpto-mfe'), undefined, 'desfazer tira o fato');
});

test('passo 0: MFE conhecido pelo outro nome vai direto, sem nada para resolver', async () => {
  let started: any;
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'atualizar-versao-mfe', params: { mfe: 'checkout', versao: '2.15.0', ambiente: 'homologação' } }), { stopReason: 'toolUse' }),
    (context) => {
      started = JSON.stringify(context).replace(/\\"/g, '"');
      return fauxAssistantMessage(fauxText('Seguindo.'));
    },
  ]);
  const orbi = init(Orbi, { id: 'chat:conceitos-checkout' });
  await orbi.read(await orbi.dispatch('Sobe a 2.15 do checkout em homologação.'));
  assert.doesNotMatch(started, /passo0/);
  assert.match(started, /navegador em http:\/\/portal.local\/apps/);
});
