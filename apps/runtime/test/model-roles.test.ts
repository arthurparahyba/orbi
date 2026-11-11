import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ModelRoles, modelForTurn, resolveRoles, turnRole } from '../src/llm/roles.ts';
import { commandProblems } from '../src/agents/tools/brain.ts';

/** A model per kind of work (docs/funcionalidades/12): talking, running, learning and correcting, the knowledge review. */

const plugin = {
  model: 'orbi-llm/yara-medio', anthropic: false,
  adapter: { name: 'yara', chat: async () => ({ text: '' }), models: [{ id: 'yara-mini', tier: 'cheap' as const }, { id: 'yara-medio' }, { id: 'yara-max', tier: 'premium' as const }] },
};

test('papéis: padrão para todos, o mais barato para o revisor; só vale modelo oferecido', () => {
  const r = resolveRoles(plugin as never, {}, {});
  assert.deepEqual(r.conversa, { model: 'yara-medio', set: false });
  assert.deepEqual(r.aprender, { model: 'yara-medio', set: false });
  assert.deepEqual(r.conhecimento, { model: 'yara-mini', set: false });
  const s = resolveRoles(plugin as never, { aprender: 'yara-max', executar: 'sumiu' }, {});
  assert.deepEqual(s.aprender, { model: 'yara-max', set: true });
  assert.deepEqual(s.executar, { model: 'yara-medio', set: false }, 'modelo que o provedor não oferece volta ao padrão');
});

test('papéis: o tipo de cada turno', () => {
  assert.equal(turnRole({ openRun: null, reviewAsksChange: false }), 'conversa');
  assert.equal(turnRole({ openRun: { kind: 'run' }, reviewAsksChange: false }), 'executar');
  assert.equal(turnRole({ openRun: { kind: 'rehearsal' }, reviewAsksChange: false }), 'aprender');
  assert.equal(turnRole({ openRun: null, reviewAsksChange: true }), 'aprender');
});

test('papéis: a escolha da conversa vale para conversar e executar, não para aprender', () => {
  const roles = resolveRoles(plugin as never, { aprender: 'yara-max' }, {});
  assert.equal(modelForTurn(plugin as never, roles, 'conversa', 'yara-mini'), 'orbi-llm/yara-mini');
  assert.equal(modelForTurn(plugin as never, roles, 'executar', 'yara-mini'), 'orbi-llm/yara-mini');
  assert.equal(modelForTurn(plugin as never, roles, 'aprender', 'yara-mini'), 'orbi-llm/yara-max');
  assert.equal(modelForTurn(plugin as never, roles, 'conhecimento', 'yara-max'), 'orbi-llm/yara-mini');
});

test('papéis: guardados nas configurações; limpar volta ao padrão', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const roles = new ModelRoles(db);
  roles.set('aprender', 'yara-max');
  roles.set('conhecimento', 'yara-mini');
  assert.deepEqual(roles.all(), { aprender: 'yara-max', conhecimento: 'yara-mini' });
  roles.set('aprender', null);
  assert.deepEqual(roles.all(), { conhecimento: 'yara-mini' });
});

test('aprender: passo com programa fora da lista é recusado antes do cartão', () => {
  const items = [{ kind: 'playbook', payload: { steps: [
    { id: 'a', how: 'run_command curl -s https://x' },
    { id: 'b', how: 'run_command git status' },
    { id: 'c', how: 'use run_command para listar' },
  ] } }];
  const p = commandProblems(items, ['git', 'cat']);
  assert.equal(p.length, 1);
  assert.match(p[0], /passo a: curl não está entre/);
  assert.deepEqual(commandProblems([{ kind: 'fact', payload: {} }], []), []);
});
