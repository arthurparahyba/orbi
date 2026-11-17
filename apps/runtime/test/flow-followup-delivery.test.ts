import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, waitFor } from './support/flow.ts';
import { services } from '../src/services.ts';
import { deliverDue } from '../src/contexts/talk/followups/src/scheduler.ts';
import { tellAgent } from '../src/contexts/talk/conversations/src/tell.ts';

/**
 * A **entrega** de um retorno agendado, pelo caminho de verdade (documento 11). O resto do
 * retorno já tinha teste — agendar, listar, a linha da situação, cancelar — mas a entrega era
 * sempre um `wake` falso. Então o trecho que ninguém exercitava era justo o que falha na prática:
 * o relógio acorda a conversa, e isso é um turno novo do agente.
 *
 * É o mesmo caminho que um dia não chegou ao Orbi no app empacotado (duas cópias do módulo do
 * agente no pacote; ver `registeredAgent` em `agents/runtime-port.ts`). Um teste de unidade com
 * `wake` falso nunca pegaria aquilo, e não pegaria de novo.
 */
test('o retorno acorda a conversa de verdade: o relógio entrega e o Orbi responde', async () => {
  const id = 'chat:retorno-entregue';
  const s = services();

  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('schedule_followup', { minutes: 1, note: 'conferir se a task subiu' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Agendado, volto em um minuto.')),
  ]);
  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('sobe a task e me avisa quando estabilizar'));

  const agendado = s.followups.active(id);
  assert.ok(agendado, 'o retorno ficou agendado');

  // O turno que o relógio provoca: é isto que nunca era exercitado.
  let acordou = '';
  faux.setResponses([
    (context) => {
      acordou = JSON.stringify(context);
      return fauxAssistantMessage(fauxText('A task subiu, está estável.'));
    },
  ]);

  const depois = new Date(Date.parse(agendado.dueAt) + 1000).toISOString();
  await deliverDue(s, (conv, body, followupId) =>
    tellAgent(s.events, Orbi, { id: conv, message: { kind: 'signal', type: 'followup', body, attributes: { followup: followupId } } }), depois);

  await waitFor(() => faux.getPendingResponseCount() === 0, 'o turno do retorno');
  assert.match(acordou, /conferir se a task subiu/, 'o Orbi acordou sabendo o que ia conferir');

  const entregue = s.followups.inConversation(id)[0];
  assert.equal(entregue?.status, 'delivered', 'e o retorno ficou marcado como entregue, não preso em `delivering`');
});
