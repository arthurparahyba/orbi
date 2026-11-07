import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BrainStore, EXAMPLE_TYPES } from '../src/brain/store.ts';
import { openDatabase } from '../src/db/database.ts';
import { MIGRATIONS } from '../src/db/migrations.ts';
import { inLearningOrder } from '../src/agents/tools/brain.ts';
import { purgeDeletedTranscripts } from '../src/conversations/purge.ts';
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

/** A brain with the example ontology (the real one starts empty). */
function exampleBrain() {
  const b = new BrainStore(':memory:');
  for (const t of EXAMPLE_TYPES) b.upsertType(t);
  return b;
}

test('cérebro: começa vazio, sem tipos nem conhecimento', () => {
  const b = new BrainStore(':memory:');
  assert.deepEqual(b.types(), []);
  assert.deepEqual(b.stats().entities, 0);
  assert.throws(() => b.upsertEntity({ id: 'x', type: 'Repositorio', props: {}, body: '' }), /tipo desconhecido/);
});

test('cérebro: num lote de aprendizado, os tipos vêm antes de quem os usa', () => {
  const items = [
    { kind: 'playbook' as const }, { kind: 'edge' as const }, { kind: 'entity' as const }, { kind: 'type' as const },
  ];
  assert.deepEqual(inLearningOrder(items).map((i) => i.kind), ['type', 'entity', 'edge', 'playbook']);
});

test('cérebro: lote checado antes de pedir aprovação e gravado tudo ou nada', () => {
  const b = new BrainStore(':memory:');
  const host = { kind: 'entity' as const, payload: { id: 'github-pessoal', type: 'Conta' } };
  const problems = b.learnProblems([host]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /entity github-pessoal: .*tipo desconhecido/);

  const batch = inLearningOrder([host, { kind: 'type' as const, payload: { name: 'Conta', description: 'Conta num serviço' } }]);
  assert.deepEqual(b.learnProblems(batch), [], 'com o tipo no mesmo lote está certo');
  assert.deepEqual(b.types(), [], 'a verificação não guarda nada');
  assert.equal(b.proposals('open').length + b.proposals('applied').length, 0);

  // One bad item: nothing of the batch lands.
  assert.throws(() => b.learn([...batch, { kind: 'edge', payload: { from: 'github-pessoal', rel: 'naoExiste', to: 'x' } }], 'r', 'chat:1'));
  assert.deepEqual(b.types(), []);
  assert.equal(b.get('github-pessoal'), undefined);
  b.learn(batch, 'r', 'chat:1');
  assert.equal(b.get('github-pessoal')?.type, 'Conta');
});

test('migração: tira os tipos de fábrica que ninguém usou e mantém os usados ou editados', () => {
  // A brain from before: created with the factory types, one of them in use, one edited.
  const dir = mkdtempSync(join(tmpdir(), 'orbi-mig-'));
  const file = join(dir, 'orbi.db');
  const old = new DatabaseSync(file);
  old.exec(MIGRATIONS.slice(0, 3).map((m) => m.sql).join('\n'));
  old.exec('PRAGMA user_version = 3');
  const ins = old.prepare('INSERT INTO types (name, description, relations, requires) VALUES (?, ?, ?, ?)');
  for (const t of EXAMPLE_TYPES) ins.run(t.name, t.description, JSON.stringify(t.relations), '[]');
  old.prepare("UPDATE types SET description = 'Repositório do GitHub da empresa' WHERE name = 'Repositorio'").run();
  old.prepare("INSERT INTO entities (id, type, updated_at) VALUES ('marina', 'Pessoa', '2026-11-01')").run();
  old.close();

  const b = new BrainStore(openDatabase(file));
  assert.deepEqual(b.types().map((t) => t.name).sort(), ['Pessoa', 'Repositorio']);
  assert.equal(b.get('marina')?.type, 'Pessoa');
});

test('cérebro: ontologia valida entidades e ligações', () => {
  const b = exampleBrain();
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
  const b = exampleBrain();
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

test('catálogo de skills: só os mais usados, em ordem estável', async () => {
  const { skillCatalog } = await import('../src/agents/tools/playbooks.ts');
  const pbs = [{ name: 'b', uses: 2 }, { name: 'a', uses: 2 }, { name: 'c', uses: 9 }, { name: 'd', uses: 0 }];
  assert.deepEqual(skillCatalog(pbs, 3).map((p) => p.name), ['c', 'a', 'b']);
  assert.deepEqual(skillCatalog(pbs, 0), []);
  assert.equal(pbs[0].name, 'b', 'não reordena a lista original');
});

test('conversa apagada: o histórico sai do arquivo do Flue na partida seguinte, só o dela', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbi-purge-'));
  const orbiFile = join(dir, 'orbi.db');
  const flueFile = join(dir, 'flue.db');
  const orbi = openDatabase(orbiFile);
  orbi.prepare('INSERT INTO deleted_conversations (id, deleted_at) VALUES (?, ?)').run('chat:apagada', new Date().toISOString());
  orbi.close();
  const flue = new DatabaseSync(flueFile);
  flue.exec(`CREATE TABLE flue_conversation_streams (path TEXT PRIMARY KEY);
    CREATE TABLE flue_conversation_stream_batches (path TEXT, seq INTEGER, data TEXT);
    CREATE TABLE flue_agent_submissions (submission_id TEXT, session_key TEXT, payload TEXT);
    CREATE TABLE flue_submission_chunks (submission_id TEXT, data TEXT);`);
  for (const id of ['chat:apagada', 'chat:fica']) {
    flue.prepare('INSERT INTO flue_conversation_streams VALUES (?)').run(`agents/orbi/${id}`);
    flue.prepare('INSERT INTO flue_conversation_stream_batches VALUES (?, 1, ?)').run(`agents/orbi/${id}`, 'minha senha é hunter2');
    flue.prepare('INSERT INTO flue_agent_submissions VALUES (?, ?, ?)').run(`s-${id}`, `agent-session:["orbi","${id}","default","default"]`, 'x');
    flue.prepare('INSERT INTO flue_submission_chunks VALUES (?, ?)').run(`s-${id}`, 'x');
  }
  flue.close();

  assert.deepEqual(purgeDeletedTranscripts(orbiFile, flueFile), ['chat:apagada']);
  const after = new DatabaseSync(flueFile);
  for (const t of ['flue_conversation_streams', 'flue_conversation_stream_batches', 'flue_agent_submissions', 'flue_submission_chunks']) {
    assert.equal((after.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n, 1, `${t}: só a outra conversa fica`);
  }
  assert.equal(JSON.stringify(after.prepare('SELECT * FROM flue_conversation_stream_batches').all()).includes('chat:apagada'), false);
  after.close();
  assert.deepEqual(purgeDeletedTranscripts(orbiFile, flueFile), [], 'cada uma é apagada uma vez');
});
