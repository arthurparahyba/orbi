import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.ts';
import { Followups } from '../src/followups/service.ts';
import { deliverDue } from '../src/followups/scheduler.ts';
import { MAX_ATTEMPTS, afterFailedDelivery, situationLine, wakeMessage, whenLabel } from '../src/followups/domain.ts';

/** Follow-ups with an owner (docs/funcionalidades/11): one per conversation, delivered for real, never lost. */

const fresh = () => new Followups(openDatabase(':memory:'));
const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

test('retorno: um por conversa; agendar de novo substitui e diz qual', () => {
  const f = fresh();
  const first = f.schedule({ conversationId: 'chat:a', minutes: 2, note: 'conferir a task do ECS' });
  assert.equal(first.replaced, undefined);
  const second = f.schedule({ conversationId: 'chat:a', minutes: 5, note: 'conferir de novo' });
  assert.equal(second.replaced?.id, first.followup.id);
  assert.equal(f.get(first.followup.id)?.status, 'cancelled');
  assert.equal(f.get(first.followup.id)?.cancelledBy, 'substituido');
  assert.equal(f.active('chat:a')?.id, second.followup.id);
  f.schedule({ conversationId: 'chat:b', minutes: 1, note: 'outra conversa' });
  assert.equal(f.allActive().length, 2);
  assert.throws(() => f.schedule({ conversationId: 'chat:a', minutes: 0, note: 'x' }), /1 minuto a 24 horas/);
  assert.throws(() => f.schedule({ conversationId: 'chat:a', minutes: 3, note: '  ' }), /o que conferir/);
});

test('retorno: entregue só depois que a conversa aceitou; cada um uma vez', async () => {
  const f = fresh();
  const { followup } = f.schedule({ conversationId: 'chat:a', minutes: 1, note: 'conferir', runId: 'r1', stepId: 'esperar-task' });
  const woke: string[] = [];
  const deps = { followups: f, inbox: { add: () => { throw new Error('não deveria') } }, brain: { run: () => ({ playbook: 'atualizar-versao' }) } } as never;
  await deliverDue(deps, async (id, body) => { woke.push(`${id}|${body}`); }, later(2));
  assert.deepEqual(woke, ['chat:a|Retorno agendado (passo esperar-task de atualizar-versao): conferir']);
  assert.equal(f.get(followup.id)?.status, 'delivered');
  assert.ok(f.get(followup.id)?.deliveredAt);
  await deliverDue(deps, async () => { woke.push('de novo'); }, later(3));
  assert.equal(woke.length, 1, 'não entrega duas vezes');
  assert.equal(f.active('chat:a'), undefined);
});

test('retorno: entrega que falha tenta de novo e, na última, vira Pendência em vez de sumir', async () => {
  const f = fresh();
  const { followup } = f.schedule({ conversationId: 'chat:a', minutes: 1, note: 'conferir o deploy' });
  const added: Array<{ kind: string; title: string; detail: string }> = [];
  const deps = { followups: f, inbox: { add: (x: { kind: string; title: string; detail: string }) => added.push(x) }, brain: { run: () => undefined } } as never;
  const failing = async () => { throw new Error('conversa ocupada'); };
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    await deliverDue(deps, failing, later(2));
    const now = f.get(followup.id)!;
    assert.equal(now.attempts, i);
    assert.equal(now.status, i < MAX_ATTEMPTS ? 'scheduled' : 'failed');
  }
  assert.equal(added.length, 1);
  assert.equal(added[0].kind, 'followup');
  assert.match(added[0].title, /Não consegui voltar à conversa às/);
  assert.match(added[0].detail, /conferir o deploy[\s\S]*conversa ocupada/);
});

test('retorno: o runtime que parou no meio da entrega devolve o retorno para a fila', () => {
  const f = fresh();
  const { followup } = f.schedule({ conversationId: 'chat:a', minutes: 1, note: 'x' });
  assert.equal(f.claimDue(later(2)).length, 1);
  assert.equal(f.get(followup.id)?.status, 'delivering');
  assert.equal(f.active('chat:a')?.id, followup.id, 'entregando ainda conta como esperando');
  assert.equal(f.recoverInterrupted(), 1);
  assert.equal(f.get(followup.id)?.status, 'scheduled');
});

test('retorno: cancelar só o que ainda não foi entregue', () => {
  const f = fresh();
  const { followup } = f.schedule({ conversationId: 'chat:a', minutes: 1, note: 'x' });
  assert.equal(f.cancel(followup.id, 'desenvolvedor')?.status, 'cancelled');
  assert.equal(f.cancel(followup.id, 'desenvolvedor'), undefined, 'cancelar de novo não faz nada');
  assert.equal(f.active('chat:a'), undefined);
});

test('retorno: o que o Orbi lê a cada turno e o que a conversa recebe', () => {
  const now = new Date('2026-11-10T15:00:00');
  assert.equal(situationLine(undefined), 'Não há retorno agendado nesta conversa.');
  assert.equal(situationLine({ dueAt: new Date('2026-11-10T15:40:00').toISOString(), note: 'conferir a task' }, now), 'Retorno agendado para 15:40: conferir a task.');
  assert.equal(whenLabel(new Date('2026-11-11T09:05:00').toISOString(), now), '11/11 09:05');
  assert.equal(wakeMessage({ note: 'conferir', stepId: null }), 'Retorno agendado: conferir');
  const failed = afterFailedDelivery({ id: 'x', conversationId: 'c', dueAt: '', note: '', status: 'delivering', attempts: MAX_ATTEMPTS - 1, createdAt: '' }, 'erro');
  assert.equal(failed.status, 'failed');
});
