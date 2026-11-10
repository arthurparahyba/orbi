import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app } from './support/flow.ts';

/** Follow-ups seen by the Orbi and by the developer (docs/funcionalidades/11). */

test('retorno: o Orbi agenda, sabe a cada turno que há um, e o desenvolvedor vê e cancela', async () => {
  let scheduledOut = '';
  let nextTurn = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('schedule_followup', { minutes: 2, note: 'conferir se a task do ECS subiu' }), { stopReason: 'toolUse' }),
  ]);
  const orbi = init(Orbi, { id: 'chat:retorno-visivel' });
  await orbi.read(await orbi.dispatch('Sobe a task e me avisa quando estabilizar.'));

  const listed = (await (await app.request('/api/followups?conversation=chat%3Aretorno-visivel')).json()) as Array<{ id: string; note: string; status: string }>;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].note, 'conferir se a task do ECS subiu');

  // Asked whether it scheduled: the answer comes from the database, in the instructions of the turn.
  faux.setResponses([
    (context) => {
      nextTurn = JSON.stringify(context);
      return fauxAssistantMessage(fauxToolCall('schedule_followup', { minutes: 5, note: 'conferir de novo' }), { stopReason: 'toolUse' });
    },
  ]);
  await orbi.read(await orbi.dispatch('Você agendou mesmo?'));
  assert.match(nextTurn, /Retorno agendado para \d\d:\d\d: conferir se a task do ECS subiu/);

  const after = (await (await app.request('/api/followups?conversation=chat%3Aretorno-visivel')).json()) as Array<{ id: string; note: string }>;
  assert.equal(after.length, 1, 'um por conversa: o novo substituiu');
  assert.equal(after[0].note, 'conferir de novo');

  const cancelled = await app.request(`/api/followups/${after[0].id}`, { method: 'DELETE' });
  assert.equal(((await cancelled.json()) as { status: string }).status, 'cancelled');

  faux.setResponses([
    (context) => {
      scheduledOut = JSON.stringify(context);
      return fauxAssistantMessage(fauxText('Não tenho retorno agendado.'));
    },
  ]);
  await orbi.read(await orbi.dispatch('E agora, tem retorno?'));
  assert.match(scheduledOut, /Não há retorno agendado nesta conversa/);
  assert.match(scheduledOut, /substituído por este/, 'a resposta da ferramenta disse que substituiu');
});
