/**
 * Choosing the model from the app: the options of this machine (plugins first), a test that
 * saves nothing, and a choice that is saved and applied only when the test passes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyModel, envFor, modelStatus, testModel } from '../src/llm/setup.ts';
import type { PluginInfo } from '../src/llm/plugins.ts';

const yara = (text = 'ok'): PluginInfo => ({
  name: 'yara', kind: 'llm', dir: '/plugins/yara', description: 'Modelo da empresa',
  plugin: { kind: 'llm', name: 'yara', create: () => ({ name: 'yara', models: [{ id: 'yara-padrao' }, { id: 'yara-grande' }], chat: async () => ({ text }) }) } as never,
});
const broken: PluginInfo = { name: 'quebrado', kind: 'llm', dir: '/plugins/quebrado', error: "Cannot find module 'node-fetch'" };
const fakeFetch = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;

test('opções: plugins primeiro (só o modelo, o acesso vem com o plugin), depois Claude e servidor', async () => {
  const s = await modelStatus({ kind: 'anthropic', model: 'anthropic/claude-haiku-5-5', anthropic: true, plugins: [yara(), broken] }, {});
  assert.deepEqual(s.options.map((o) => o.kind), ['yara', 'quebrado', 'anthropic', 'openai-compatible']);
  assert.deepEqual(s.options[0]!.fields, ['model'], 'plugin não pede chave');
  assert.deepEqual(s.options[0]!.models, ['yara-padrao', 'yara-grande']);
  assert.match(s.options[1]!.error ?? '', /node-fetch/);
  assert.equal(s.ready, false);
  assert.match(s.problem ?? '', /falta a chave/);
});

test('Claude: a chave é conferida sem gastar; recusada ou sem rede, diz o que fazer', async () => {
  assert.equal((await testModel({ kind: 'anthropic', apiKey: 'sk-ant-x' }, { env: {}, plugins: [], fetchImpl: fakeFetch(200) })).ok, true);
  assert.match((await testModel({ kind: 'anthropic', apiKey: 'sk-ant-x' }, { env: {}, plugins: [], fetchImpl: fakeFetch(401) })).detail, /recusou/);
  const offline = (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;
  assert.match((await testModel({ kind: 'anthropic', apiKey: 'k' }, { env: {}, plugins: [], fetchImpl: offline })).detail, /api\.anthropic\.com/);
  assert.match((await testModel({ kind: 'anthropic' }, { env: {}, plugins: [] })).detail, /Falta a chave/);
});

test('plugin: um pedido curto; resposta vazia ou plugin quebrado viram mensagem', async () => {
  assert.match((await testModel({ kind: 'yara', model: 'yara-grande' }, { env: {}, plugins: [yara()] })).detail, /respondeu em \d+ s com yara-grande/);
  assert.match((await testModel({ kind: 'yara' }, { env: {}, plugins: [yara('')] })).detail, /resposta vazia/);
  assert.match((await testModel({ kind: 'quebrado' }, { env: {}, plugins: [broken] })).detail, /não carregou/);
  assert.match((await testModel({ kind: 'openai-compatible' }, { env: {}, plugins: [] })).detail, /Falta o endereço/);
});

test('escolher: só salva e vale se o teste passa; a chave vai para o .env da pasta de dados', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbi-model-'));
  const env: NodeJS.ProcessEnv = {};
  const s = { llm: { kind: 'anthropic', model: 'anthropic/claude-haiku-5-5', anthropic: true, plugins: [yara()] } as never, config: { cwd: dir, model: 'anthropic/claude-haiku-5-5' } };

  const refused = await applyModel({ kind: 'anthropic', apiKey: 'sk-ruim' }, s, { env, fetchImpl: fakeFetch(401) });
  assert.equal(refused.ok, false);
  assert.equal(env.ANTHROPIC_API_KEY, undefined, 'teste falhou: nada muda');

  const ok = await applyModel({ kind: 'yara', model: 'yara-grande' }, s, { env });
  assert.equal(ok.ok, true);
  assert.equal(s.config.model, 'orbi-llm/yara-grande', 'vale já, sem reiniciar');
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), /ORBI_LLM='yara'/);
  assert.equal((s.llm as { adapter?: { name: string } }).adapter?.name, 'yara');

  const claude = await applyModel({ kind: 'anthropic', apiKey: 'sk-ant-boa', model: 'claude-sonnet-5-5' }, s, { env, fetchImpl: fakeFetch(200) });
  assert.equal(claude.ok, true);
  assert.equal(s.config.model, 'anthropic/claude-sonnet-5-5');
  assert.equal((s.llm as { adapter?: unknown }).adapter, undefined, 'saiu do plugin');
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant-boa');
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), /ANTHROPIC_API_KEY='sk-ant-boa'/);
});

test('envFor: o formulário muda só o que tem', () => {
  assert.equal(envFor({ kind: 'anthropic', model: 'claude-haiku-5-5' }, { ANTHROPIC_API_KEY: 'k' }).ANTHROPIC_API_KEY, 'k');
  assert.equal(envFor({ kind: 'yara' }, { ORBI_LLM_MODEL: 'velho' }).ORBI_LLM_MODEL, undefined, 'plugin sem modelo usa o primeiro dele');
});
