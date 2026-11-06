/**
 * The brain's rules without a database (brain/domain), and the single
 * database: migrations, adopting the old brain.db, importing the old JSON files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SEED_TYPES, edgeProblems, entityProblems, findGaps } from '../src/brain/domain/ontology.ts';
import { advanceRun, fillParams, newRun, playbookProblems } from '../src/brain/domain/playbooks.ts';
import { changeFromProposal, proposalProblems } from '../src/brain/domain/learning.ts';
import type { Edge, Entity, Playbook } from '../src/brain/domain/types.ts';
import { openDatabase, schemaVersion } from '../src/db/database.ts';
import { MIGRATIONS } from '../src/db/migrations.ts';

const typeOf = (name: string) => SEED_TYPES.find((t) => t.name === name);
const entity = (id: string, type: string, props: Record<string, unknown> = {}): Entity => ({ id, type, props, body: '', updatedAt: '' });

test('ontologia: entidade e ligação válidas ou explicadas', () => {
  assert.deepEqual(entityProblems({ id: 'novo-front', type: 'Repositorio' }, typeOf), []);
  assert.deepEqual(entityProblems({ id: ' x', type: 'Nave' }, typeOf), ['id inválido: " x"', 'tipo desconhecido: Nave']);
  const repo = entity('novo-front', 'Repositorio');
  const cls = entity('FrontEnd', 'Classe');
  assert.deepEqual(edgeProblems({ from: 'novo-front', rel: 'eUm', to: 'FrontEnd' }, repo, cls, typeOf), []);
  assert.match(edgeProblems({ from: 'novo-front', rel: 'publicaEm', to: 'FrontEnd' }, repo, cls, typeOf)[0], /aponta para Ambiente, não Classe/);
  assert.match(edgeProblems({ from: 'x', rel: 'eUm', to: 'FrontEnd' }, undefined, cls, typeOf)[0], /origem não existe/);
});

test('lacunas vêm do tipo e das classes da entidade', () => {
  const entities = [entity('FrontEnd', 'Classe', { requires: ['registradoEm'] }), entity('novo-front', 'Repositorio'), entity('outro', 'Repositorio')];
  const edges: Record<string, Edge[]> = {
    'novo-front': [{ from: 'novo-front', rel: 'eUm', to: 'FrontEnd', attrs: {}, validFrom: '', validTo: null }],
  };
  assert.deepEqual(findGaps(entities, (id) => edges[id] ?? [], typeOf), [{ entity: 'novo-front', type: 'Repositorio', missing: 'registradoEm' }]);
});

test('playbook: validação, parâmetros e status da execução', () => {
  assert.deepEqual(playbookProblems({ name: 'Versao Portal', steps: [] }), ['nome de playbook inválido: Versao Portal', 'playbook sem passos']);
  assert.equal(fillParams('Abrir {{mfe}} com {{segredo:portal/senha}}', { mfe: 'novo-front' }), 'Abrir novo-front com {{segredo:portal/senha}}');
  const pb = { name: 'p', steps: [{ id: 'a', label: 'A {{x}}', how: '' }, { id: 'b', label: 'B', how: '' }] } as Playbook;
  let run = newRun(pb, 'r1', 'chat:1', { x: '1' }, 't0');
  assert.equal(run.steps[0].label, 'A 1');
  run = advanceRun(run, 'a', 'done', undefined, 't1');
  assert.equal(run.status, 'running');
  run = advanceRun(run, 'b', 'waiting', 'esperando CI', 't2');
  assert.equal(run.status, 'waiting');
  run = advanceRun(run, 'b', 'done', undefined, 't3');
  assert.deepEqual([run.status, run.finishedAt, run.steps[1].note], ['done', 't3', 'esperando CI']);
  assert.throws(() => advanceRun(run, 'z', 'done', undefined, 't4'), /passo não encontrado/);
});

test('aprendizado: proposta checada e transformada em mudança', () => {
  const ctx = { typeOf, entity: (id: string) => (id === 'novo-front' ? entity('novo-front', 'Repositorio') : undefined) };
  assert.deepEqual(proposalProblems('edge', { from: 'novo-front', rel: 'voa', to: 'x' }, ctx), ['ligação "voa" não existe para Repositorio']);
  assert.deepEqual(proposalProblems('edge', { from: 'ainda-vai-existir', rel: 'qualquer' }, ctx), [], 'origem criada no mesmo lote');
  const change = changeFromProposal('playbook', { name: 'p', steps: [{ id: 'a', label: 'A', how: '' }] }, 'chat:9');
  assert.equal(change.kind, 'playbook');
  assert.equal(change.kind === 'playbook' && change.playbook.learnedFrom, 'chat:9');
  assert.equal(change.kind === 'playbook' && change.playbook.autonomy, 'ask');
});

test('banco: migrações em ordem, uma vez só', () => {
  const db = openDatabase(':memory:');
  assert.equal(schemaVersion(db), MIGRATIONS.length);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
  for (const t of ['entities', 'edges', 'playbooks', 'inbox_items', 'conversations', 'settings']) assert.ok(tables.includes(t), t);
});

test('primeira partida depois da atualização: brain.db antigo e JSON entram no banco único', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbi-legado-'));
  const data = join(dir, 'data');
  // An old brain.db (schema without user_version) with one entity.
  const { mkdirSync } = await import('node:fs');
  mkdirSync(data);
  const old = new DatabaseSync(join(data, 'brain.db'));
  old.exec(MIGRATIONS[0].sql);
  old.exec("INSERT INTO types (name) VALUES ('Classe'); INSERT INTO entities (id, type, updated_at) VALUES ('FrontEnd', 'Classe', 'x')");
  old.close();
  writeFileSync(join(data, 'inbox.json'), JSON.stringify([{ id: 'i1', kind: 'question', conversationId: 'chat:1', title: 'Qual branch?', detail: '', createdAt: '2026-11-01T00:00:00Z', status: 'open' }]));
  writeFileSync(join(data, 'conversations.json'), JSON.stringify([{ id: 'chat:1', title: 'Antiga', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' }]));
  writeFileSync(join(data, 'autonomy.json'), JSON.stringify({ categories: { 'comandos-escrita': 'auto' } }));

  const { loadConfig } = await import('../src/config.ts');
  const { createOrbi } = await import('../src/compose.ts');
  const orbi = await createOrbi(loadConfig({ ORBI_VAULT: 'file' }, dir), {}, {});
  assert.equal(orbi.brain.get('FrontEnd')?.type, 'Classe', 'cérebro antigo preservado');
  assert.ok(existsSync(join(data, 'orbi.db')) && !existsSync(join(data, 'brain.db')));
  assert.equal(orbi.inbox.get('i1')?.title, 'Qual branch?');
  assert.equal(orbi.conversations.list()[0].title, 'Antiga');
  assert.equal(orbi.policy.get().categories['comandos-escrita'], 'auto');
  assert.ok(existsSync(join(data, 'inbox.json.importado')) && !existsSync(join(data, 'inbox.json')), 'importado uma vez só');
});
