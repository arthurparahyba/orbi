import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrainStore } from '../src/brain/store.ts';
import { runCommand, CommandNotAllowedError } from '../src/terminal/exec.ts';
import {
  DEFAULT_POLICY,
  browserCategory,
  codeFixCategory,
  commandCategory,
  decide,
  parsePolicy,
} from '../src/autonomy/policy.ts';

test('exec: só roda binários permitidos, sem shell', async () => {
  assert.throws(() => runCommand('bash', ['-c', 'echo oi']), CommandNotAllowedError);
  assert.throws(() => runCommand('/usr/bin/git', ['status']), CommandNotAllowedError);
  const r = await runCommand('git', ['--version']);
  assert.equal(r.exitCode, 0);
  // A "; rm" argument is just an argument: git receives it literally and fails safely.
  const injected = await runCommand('git', ['log; rm -rf /']);
  assert.notEqual(injected.exitCode, 0);
});

test('autonomia: comandos de leitura vs escrita', () => {
  assert.equal(commandCategory('git', ['log', '--oneline']), 'comandos-leitura');
  assert.equal(commandCategory('git', ['push', 'origin', 'main']), 'comandos-escrita');
  assert.equal(commandCategory('git', ['branch', '-D', 'x']), 'comandos-escrita');
  assert.equal(commandCategory('gh', ['run', 'view', '123', '--log-failed']), 'comandos-leitura');
  assert.equal(commandCategory('gh', ['run', 'watch', '123']), 'comandos-leitura');
  assert.equal(commandCategory('gh', ['pr', 'merge', '12', '--squash']), 'comandos-escrita');
  assert.equal(commandCategory('gh', ['workflow', 'run', 'release.yml']), 'comandos-escrita');
  assert.equal(commandCategory('gh', ['api', 'repos/x/y/pulls']), 'comandos-leitura');
  assert.equal(commandCategory('gh', ['api', '-X', 'POST', 'repos/x/y/merges']), 'comandos-escrita');
  assert.equal(commandCategory('aws', ['logs', 'tail', '/ecs/api', '--since', '30m']), 'comandos-leitura');
  assert.equal(commandCategory('aws', ['ecs', 'describe-services', '--cluster', 'dev']), 'comandos-leitura');
  assert.equal(commandCategory('aws', ['ecs', 'update-service', '--cluster', 'dev']), 'comandos-escrita');
  assert.equal(browserCategory('take_snapshot'), 'navegador-leitura');
  assert.equal(browserCategory('click'), 'navegador-escrita');
  assert.equal(codeFixCategory(['src/test/java/PixServiceTest.java']), 'codigo-teste');
  assert.equal(codeFixCategory(['src/main/java/PixService.java', 'src/test/java/PixServiceTest.java']), 'codigo-producao');
});

test('autonomia: playbook em auto libera escrita, mas nunca código de produção nem aprendizado', () => {
  const p = DEFAULT_POLICY;
  assert.equal(decide(p, 'comandos-escrita'), 'ask');
  assert.equal(decide(p, 'comandos-escrita', { autonomy: 'auto' }), 'auto');
  assert.equal(decide(p, 'codigo-producao', { autonomy: 'auto' }), 'ask');
  assert.equal(decide(p, 'aprender', { autonomy: 'auto' }), 'ask');
  const observing = parsePolicy({ categories: { 'navegador-escrita': 'observe', bogus: 'auto' } });
  assert.equal(decide(observing, 'navegador-escrita', { autonomy: 'auto' }), 'observe');
  assert.equal(parsePolicy({ categories: { aprender: 'auto' } }).categories.aprender, 'auto');
  assert.equal(decide(parsePolicy({ categories: { aprender: 'auto' } }), 'aprender'), 'ask', 'aprender sempre espera');
});

test('cérebro: ontologia valida entidades e ligações', () => {
  const b = new BrainStore(':memory:');
  b.upsertEntity({ id: 'api-pagamentos', type: 'Repositorio', props: {}, body: '' });
  b.upsertEntity({ id: 'dev', type: 'Ambiente', props: {}, body: '' });
  assert.throws(() => b.upsertEntity({ id: 'x', type: 'Inexistente', props: {}, body: '' }), /tipo desconhecido/);
  assert.throws(() => b.addEdge({ from: 'api-pagamentos', rel: 'voaPara', to: 'dev' }), /não existe/);
  assert.throws(() => b.addEdge({ from: 'dev', rel: 'publicaEm', to: 'api-pagamentos' }), /não existe para Ambiente/);
  b.addEdge({ from: 'api-pagamentos', rel: 'publicaEm', to: 'dev' });
  assert.equal(b.neighbors('api-pagamentos').out.length, 1);
  assert.deepEqual(b.reachable('dev').map((r) => r.id), ['api-pagamentos']);
});

test('cérebro: fatos com validade expiram sozinhos', () => {
  const b = new BrainStore(':memory:');
  for (const [id, type] of [['marina', 'Pessoa'], ['rafael', 'Pessoa'], ['chg0041', 'Mudanca']]) {
    b.upsertEntity({ id, type, props: {}, body: '' });
  }
  b.addEdge({ from: 'chg0041', rel: 'aprovadaPor', to: 'marina', validFrom: '2026-11-05T00:00:00Z', validTo: '2026-12-31T23:59:59Z' });
  b.addEdge({ from: 'chg0041', rel: 'aprovadaPor', to: 'rafael', validFrom: '2027-01-01T00:00:00Z' });
  const who = (at: string) => b.neighbors('chg0041', { rel: 'aprovadaPor', at }).out.map((e) => e.to);
  assert.deepEqual(who('2026-12-10T12:00:00Z'), ['marina']);
  assert.deepEqual(who('2027-01-15T12:00:00Z'), ['rafael']);
});

test('cérebro: proposta só vale depois de aplicada; playbook conta usos e sucessos', () => {
  const b = new BrainStore(':memory:');
  assert.throws(() => b.propose('entity', { id: 'x', type: 'Nada' }, 'teste', 'c1'), /proposta inválida/);
  const p = b.propose('playbook', { name: 'subir-dev', description: 'Subir para dev', trigger: 'pedido', steps: [{ id: 'a', label: 'Push', how: 'git push' }] }, 'ensinado', 'c1');
  assert.equal(b.playbook('subir-dev'), undefined);
  b.apply(p.id);
  assert.equal(b.playbook('subir-dev')?.autonomy, 'ask');
  assert.throws(() => b.apply(p.id), /já decidida/);
  const run = b.startRun('subir-dev', 'c1');
  assert.equal(b.updateRunStep(run.id, 'a', 'done').status, 'done');
  assert.deepEqual([b.playbook('subir-dev')?.uses, b.playbook('subir-dev')?.successes], [1, 1]);
});
