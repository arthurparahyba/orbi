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
import { EXAMPLE_TYPES, edgeProblems, entityProblems, findGaps } from '../src/brain/domain/ontology.ts';
import { advanceRun, fillParams, newRun, playbookProblems } from '../src/brain/domain/playbooks.ts';
import { changeFromProposal, proposalProblems } from '../src/brain/domain/learning.ts';
import type { Edge, Entity, Playbook } from '../src/brain/domain/types.ts';
import { openDatabase, schemaVersion } from '../src/db/database.ts';
import { MIGRATIONS } from '../src/db/migrations.ts';

const typeOf = (name: string) => EXAMPLE_TYPES.find((t) => t.name === name);
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
  const ctx = { typeOf, entity: (id: string) => (id === 'novo-front' ? entity('novo-front', 'Repositorio') : undefined), playbook: () => undefined };
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

import { ftsQuery, sharedStems, stem, words } from '../src/brain/domain/similarity.ts';
import { BrainStore } from '../src/brain/store.ts';
import { evalBrain, evaluateSearch, formatResults } from '../scripts/eval-search.ts';

const pb = (name: string, description: string, trigger = '', steps: string[] = []) => ({
  name, description, trigger, appliesTo: null, autonomy: 'ask' as const, instructions: '', learnedFrom: null, variationOf: null,
  uses: 0, successes: 0, updatedAt: '', steps: steps.map((label, i) => ({ id: String(i), label, how: '' })),
});

test('busca: palavras sem acento nem palavrinhas, cortadas no radical', () => {
  assert.deepEqual(words('Deleta os repositórios da organização, por favor'), ['deleta', 'repositorios', 'organizacao']);
  assert.deepEqual(['deleta', 'deletar', 'deletado'].map(stem), ['delet', 'delet', 'delet']);
  assert.deepEqual(['versao', 'versoes'].map(stem), ['vers', 'vers']);
  assert.equal(stem('v2.5'), 'v2.5');
  assert.equal(ftsQuery('Deleta o repositório'), '"delet"* OR "repositori"*');
  assert.equal(ftsQuery('de para o'), '');
  assert.deepEqual(sharedStems('deletar repositório', 'Cria um repositório'), ['repositori']);
});

test('busca: o índice acompanha cada escrita e ordena pelo que mais combina', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook(pb('criar-repositorio', 'Cria um repositório na organização', 'pedirem um repositório novo', ['Criar']));
  b.savePlaybook(pb('subir-para-dev', 'Sobe o serviço para dev', '', ['Conferir repositório verde']));
  const found = b.searchPlaybooks('deletar o repositório teste-orbi');
  assert.deepEqual(found.map((c) => c.playbook.name), ['criar-repositorio', 'subir-para-dev'], 'no nome pesa mais que nos passos');
  b.savePlaybook(pb('deletar-repositorio', 'Apaga um repositório', 'pedirem para apagar', ['Apagar']));
  assert.equal(b.searchPlaybooks('Deleta o repositório teste-orbi')[0].playbook.name, 'deletar-repositorio', 'gravou, já está no índice');
  assert.deepEqual(b.searchPlaybooks('pagar boleto'), []);

  b.upsertType({ name: 'Repositorio', description: '', relations: {}, requires: [] });
  b.upsertEntity({ id: 'portal-clientes-front', type: 'Repositorio', props: { github: 'acme/portal-clientes-front' }, body: 'Front do portal de clientes.' });
  assert.equal(b.search('clientes')[0]?.id, 'portal-clientes-front');
});

test('busca: acerto medido no conjunto de pedidos (test/fixtures/search-eval.json)', () => {
  const brain = evalBrain();
  const [lexical, semantic] = evaluateSearch((text) => brain.searchPlaybooks(text, 3).map((c) => c.playbook.name));
  // Floors, not goals: raising them is the point of each search change. Synonyms wait for search by meaning.
  assert.ok(lexical.at3 / lexical.total >= 0.95, formatResults([lexical, semantic]));
  assert.ok(lexical.at1 / lexical.total >= 0.9, formatResults([lexical, semantic]));
});

test('variação: precisa de uma base que existe e fica ligada a ela', () => {
  const b = new BrainStore(':memory:');
  const base = pb('criar-repositorio', 'Cria', '', ['Conferir']);
  b.savePlaybook(base);
  assert.throws(() => b.savePlaybook({ ...base, name: 'deletar-repositorio', variationOf: 'nao-existe' }), /base não existe/);
  assert.throws(() => b.savePlaybook({ ...base, variationOf: 'criar-repositorio' }), /base não existe/, 'não pode ser variação de si mesmo');
  b.savePlaybook({ ...base, name: 'deletar-repositorio', variationOf: 'criar-repositorio' });
  assert.equal(b.playbook('deletar-repositorio')?.variationOf, 'criar-repositorio');
});

test('edição: entidade troca propriedades e texto, mantém tipo; o índice acompanha', () => {
  const b = new BrainStore(':memory:');
  b.upsertType({ name: 'Portal', description: '', relations: { usa: 'Portal' }, requires: [] });
  b.upsertEntity({ id: 'portal-parceiros', type: 'Portal', props: { url: 'https://antigo' }, body: 'Portal de parceiros' });
  const edited = b.editEntity('portal-parceiros', { props: { url: 'https://novo.parceiros' } });
  assert.equal(edited.type, 'Portal');
  assert.equal(edited.body, 'Portal de parceiros', 'o que não veio fica como estava');
  assert.equal(b.search('novo.parceiros')[0]?.id, 'portal-parceiros');
  assert.equal(b.search('antigo').length, 0);
  assert.throws(() => b.editEntity('nao-existe', {}), /não encontrada/);
});

test('exclusão: entidade leva as ligações junto, inclusive as passadas', () => {
  const b = new BrainStore(':memory:');
  b.upsertType({ name: 'Pessoa', description: '', relations: { substitutaDe: 'Pessoa' }, requires: [] });
  for (const id of ['marina', 'rafael', 'ana']) b.upsertEntity({ id, type: 'Pessoa', props: {}, body: '' });
  b.addEdge({ from: 'rafael', rel: 'substitutaDe', to: 'marina' });
  b.addEdge({ from: 'ana', rel: 'substitutaDe', to: 'marina', validFrom: '2025-01-01T00:00:00Z', validTo: '2025-06-01T00:00:00Z' });
  assert.deepEqual(b.entityDependents('marina'), { relations: 2 });
  assert.deepEqual(b.deleteEntity('marina'), { relations: 2 });
  assert.equal(b.get('marina'), undefined);
  assert.equal(b.graph().edges.length, 0);
  assert.equal(b.search('marina').length, 0, 'sai do índice');
});

test('edição de procedimento: valida passos, mantém nome, autonomia, base e contadores', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook(pb('criar-repositorio', 'Cria', 'pedido', ['Conferir', 'Criar']));
  b.savePlaybook({ ...pb('deletar-repositorio', 'Apaga', 'pedido', ['Apagar']), variationOf: 'criar-repositorio' });
  b.setPlaybookAutonomy('criar-repositorio', 'auto');
  b.startRun('criar-repositorio', 'c1');
  const edited = b.editPlaybook('criar-repositorio', {
    description: 'Cria um repositório com o template do time',
    steps: [{ id: '1', label: 'Criar', how: 'gh repo create' }, { id: 'avisar', label: 'Avisar', how: 'link' }],
  });
  assert.equal(edited.autonomy, 'auto');
  assert.equal(edited.uses, 1, 'contadores ficam');
  assert.deepEqual(edited.steps.map((s) => s.id), ['1', 'avisar']);
  assert.equal(b.searchPlaybooks('template')[0].playbook.name, 'criar-repositorio', 'o índice acompanha');
  assert.throws(() => b.editPlaybook('criar-repositorio', { steps: [] }), /sem passos/);
  assert.throws(() => b.editPlaybook('criar-repositorio', { steps: [{ id: 'a', label: 'A', how: '' }, { id: 'a', label: 'B', how: '' }] }), /repetido/);
  assert.throws(() => b.editPlaybook('criar-repositorio', { steps: [{ id: 'a', label: ' ', how: '' }] }), /sem nome/);
});

test('exclusão de procedimento: variações ficam sem a ligação, histórico fica', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook(pb('criar-repositorio', 'Cria', 'pedido', ['Criar']));
  b.savePlaybook({ ...pb('deletar-repositorio', 'Apaga', 'pedido', ['Apagar']), variationOf: 'criar-repositorio' });
  b.startRun('criar-repositorio', 'c1');
  assert.deepEqual(b.deletePlaybook('criar-repositorio'), { detachedVariations: ['deletar-repositorio'] });
  assert.equal(b.playbook('criar-repositorio'), undefined);
  assert.equal(b.playbook('deletar-repositorio')?.variationOf, null);
  assert.equal(b.runs().length, 1, 'execuções passadas continuam em Execuções');
  assert.equal(b.searchPlaybooks('cria').length, 0);
});

test('id de passo novo a partir do nome, sem repetir', async () => {
  const { stepId } = await import('../src/brain/domain/playbooks.ts');
  assert.equal(stepId('Abrir o portal', []), 'abrir-o-portal');
  assert.equal(stepId('Abrir o portal', ['abrir-o-portal']), 'abrir-o-portal-2');
  assert.equal(stepId('✓', []), 'passo');
});
