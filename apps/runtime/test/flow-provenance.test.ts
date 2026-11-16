import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, knowledge, inbox } from './support/flow.ts';

/**
 * Procedência (documento 28, fase C): de onde um fato veio no mundo. A ferramenta que produziu a
 * informação sabe — o terminal sabe o programa e os argumentos — e o `brain_learn` carimba.
 * O modelo não escolhe: o que ele escrever nesses campos é descartado.
 */
const json = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

test('o fato guarda o comando que o produziu, e o que o modelo inventou é descartado', async () => {
  const id = 'chat:procedencia';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'cat', args: ['conta.txt'], purpose: 'ver o número da conta' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(
      fauxToolCall('brain_learn', {
        reason: 'guardar a conta',
        items: [
          { kind: 'type', payload: { name: 'Conta', description: 'uma conta de nuvem' } },
          {
            kind: 'entity',
            payload: {
              id: 'conta-1234', type: 'Conta', props: { numero: '1234' },
              // O modelo tentando escrever a procedência: tem de ser ignorado.
              foundIn: { kind: 'person', ref: 'eu lembro de cabeça', at: '2020-01-01T00:00:00.000Z' },
            },
          },
        ],
      }),
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage(fauxText('Guardei.')),
  ]);

  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('vê o número da conta e guarda'));

  const card = inbox.list({ status: 'open' }).find((i) => i.conversationId === id);
  assert.ok(card, 'nada entra no cérebro sem o cartão');
  faux.setResponses([fauxAssistantMessage(fauxText('Guardei a conta.'))]);
  const res = await app.request(`/api/inbox/${card.id}/decision`, json({ decision: 'approve', approver: 'Arthur' }));
  assert.equal(res.status, 202);
  await orbi.read(await res.json());

  const fato = knowledge.get('conta-1234');
  assert.ok(fato, 'aprovado, o fato está no cérebro');
  assert.equal(fato.foundIn?.kind, 'cli', 'veio de um comando, não de alguém lembrando de cabeça');
  assert.equal(fato.foundIn?.ref, 'cat conta.txt');
  assert.ok(fato.checkedAt, 'e com a data em que foi conferido na fonte');
  assert.notEqual(fato.foundIn?.at, '2020-01-01T00:00:00.000Z', 'a data do modelo também é descartada');
});

test('a chamada que não rodou não é procedência de nada', async () => {
  const id = 'chat:procedencia-recusada';
  faux.setResponses([
    // Programa que esta máquina não permite: recusado antes de qualquer cartão, e nada veio do mundo.
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'rm', args: ['-rf', 'pasta'], purpose: 'limpar a pasta' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(
      fauxToolCall('brain_learn', {
        reason: 'guardar a pasta',
        items: [
          { kind: 'type', payload: { name: 'Pasta', description: 'uma pasta do projeto' } },
          { kind: 'entity', payload: { id: 'pasta-nova', type: 'Pasta', props: {}, foundIn: { kind: 'cli', ref: 'rm -rf pasta', at: '2026-01-01T00:00:00.000Z' } } },
        ],
      }),
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage(fauxText('Proposto.')),
  ]);

  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('limpa a pasta e guarda'));

  const card = inbox.list({ status: 'open' }).find((i) => i.conversationId === id && i.kind === 'learning');
  assert.ok(card, 'o aprendizado foi proposto');
  faux.setResponses([fauxAssistantMessage(fauxText('Guardei.'))]);
  const res = await app.request(`/api/inbox/${card.id}/decision`, json({ decision: 'approve', approver: 'Arthur' }));
  await orbi.read(await res.json());

  const fato = knowledge.get('pasta-nova');
  assert.ok(fato, 'o fato entrou');
  assert.equal(fato.foundIn, null, 'o comando não rodou: não há de onde, e o que o modelo escreveu foi descartado');
  assert.equal(fato.checkedAt, null, 'sem fonte, não há o que conferir');
});
