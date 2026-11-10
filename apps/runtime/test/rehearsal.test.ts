import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreementOf, agreementProblems, finishRehearsal, newRehearsal, rehearsalStep, testedRunProblem } from '../src/brain/domain/rehearsal.ts';

const agreement = { start: 'pedido de preços', receives: ['categoria'], end: 'página gerada', outside: [], corrections: [] };

test('ensaio: os passos crescem conforme são tentados; atualizar pelo id', () => {
  let run = newRehearsal('r1', 'chat:x', 'preços', '2026-11-10T00:00:00Z');
  run = rehearsalStep(run, { label: 'Abrir a loja', status: 'running' });
  run = rehearsalStep(run, { label: 'Entrar', status: 'waiting', note: 'aprovação no celular' });
  assert.equal(run.status, 'waiting');
  run = rehearsalStep(run, { id: 'entrar', label: 'Entrar', status: 'done' });
  run = rehearsalStep(run, { id: 'abrir-a-loja', label: 'Abrir a loja', status: 'done' });
  assert.deepEqual(run.steps.map((s) => [s.id, s.status]), [['abrir-a-loja', 'done'], ['entrar', 'done']]);
  assert.equal(run.steps[1].note, 'aprovação no celular', 'a nota fica quando não vem outra');
  assert.equal(run.status, 'running');
});

test('ensaio: termina com o acordo; o que ficou aberto vira pulado; sem início ou fim não termina', () => {
  let run = newRehearsal('r1', 'chat:x', 'preços', '2026-11-10T00:00:00Z');
  run = rehearsalStep(run, { label: 'Abrir a loja', status: 'running' });
  assert.deepEqual(agreementProblems({ ...agreement, start: '', end: ' ' }), ['diga quando o procedimento começa (start)', 'diga quando ele termina (end)']);
  const done = finishRehearsal(run, agreement, '2026-11-10T01:00:00Z');
  assert.equal(done.status, 'done');
  assert.equal(done.steps[0].status, 'skipped');
  assert.deepEqual(agreementOf(done), agreement);
  assert.throws(() => rehearsalStep(done, { label: 'mais', status: 'done' }), /já terminou/);
});

test('ensaio: o que prova que um procedimento funciona', () => {
  const open = newRehearsal('r1', 'chat:x', 'preços', '2026-11-10T00:00:00Z');
  assert.match(testedRunProblem(undefined, 'p', 'x')!, /não existe/);
  assert.match(testedRunProblem(open, 'p', 'r1')!, /ainda não terminou com o acordo/);
  assert.equal(testedRunProblem(finishRehearsal(open, agreement, 'x'), 'p', 'r1'), null);
  const run = { ...open, kind: 'run' as const, playbook: 'p', status: 'done' as const };
  assert.equal(testedRunProblem(run, 'p', 'r1'), null, 'uma execução dele que deu certo também prova');
  assert.match(testedRunProblem({ ...run, playbook: 'outro' }, 'p', 'r1')!, /não é uma execução de p/);
});
