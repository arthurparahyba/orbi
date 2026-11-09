/**
 * Plugins: discovery and validation, ORBI_LLM=<plugin>, the checker behind
 * `npm run plugin:test`, and the scaffold from `npm run plugin:new`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { appDataHome, discoverPlugins, pluginDirs } from '../src/llm/plugins.ts';
import { configureLlm } from '../src/llm/index.ts';
import { checkAdapter } from '../src/llm/plugin-check.ts';
import type { LlmAdapter } from '../src/llm/types.ts';

const plugin = (dir: string, name: string, body: string, pkg?: object) => {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, pkg ? 'main.mjs' : 'index.mjs'), body);
  if (pkg) writeFileSync(join(dir, name, 'package.json'), JSON.stringify(pkg));
};
const good = (name: string) =>
  `export default { kind: 'llm', name: '${name}', apiVersion: 1, description: 'teste', create: (s) => ({ name: '${name}', models: [{ id: s.model ?? 'm' }], async chat(r) { return { text: 'oi de ${name}' }; } }) };`;

test('descobre plugins válidos e explica os que não servem', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbi-plugins-'));
  plugin(dir, 'gateway', good('gateway-empresa'));
  plugin(dir, 'com-main', good('com-main'), { main: 'main.mjs' });
  plugin(dir, 'versao-velha', `export default { kind: 'llm', name: 'velho', apiVersion: 0, create() {} };`);
  plugin(dir, 'quebrado', `export default {;`);
  plugin(dir, 'outro-tipo', `export default { kind: 'cofre', name: 'x', apiVersion: 1, create() {} };`);
  plugin(dir, 'repetido', good('gateway-empresa'));
  mkdirSync(join(dir, 'vazio'));

  const found = await discoverPlugins([dir]);
  const by = (folder: string) => found.find((p) => p.dir.endsWith(folder))!;
  assert.equal(by('gateway').name, 'gateway-empresa');
  assert.ok(by('gateway').plugin && !by('gateway').error);
  assert.ok(by('com-main').plugin, 'package.json main');
  assert.match(by('versao-velha').error!, /versão 0 do contrato; este Orbi usa a versão 1/);
  assert.match(by('quebrado').error!, /falhou ao carregar/);
  assert.match(by('outro-tipo').error!, /kind "cofre" não suportado/);
  assert.match(by('repetido').error!, /nome repetido/);
  assert.match(by('vazio').error!, /sem index\.mjs/);

  const active = await configureLlm({ ORBI_LLM: 'gateway-empresa', ORBI_LLM_MODEL: 'llm-x' }, dir, found);
  assert.equal(active.adapter?.name, 'gateway-empresa');
  assert.equal(active.model, 'orbi-llm/llm-x');
  await assert.rejects(configureLlm({ ORBI_LLM: 'velho' }, dir, found), /desconhecido/);
  await assert.rejects(configureLlm({ ORBI_LLM: 'versao-velha' }, dir, found), /não pôde ser usado.*versão 0/);
});

test('ORBI_PLUGINS_DIR aceita várias pastas; sem ela, procura plugins/ perto do runtime', () => {
  assert.deepEqual(pluginDirs({ ORBI_PLUGINS_DIR: '/a:/b' }, '/x'), ['/a', '/b']);
  const repo = mkdtempSync(join(tmpdir(), 'orbi-repo-'));
  mkdirSync(join(repo, 'plugins'));
  mkdirSync(join(repo, 'apps', 'runtime'), { recursive: true });
  assert.deepEqual(pluginDirs({}, join(repo, 'apps', 'runtime'), join(repo, 'sem-app')), [join(repo, 'plugins')]);
});

/** A model that behaves: answers text, calls the tool, reads its result. */
const capable: LlmAdapter = {
  name: 'capaz',
  models: [{ id: 'm' }],
  async chat(req) {
    const last = req.messages.at(-1);
    if (last?.role === 'tool') return { text: `O resultado é ${last.content}.` };
    if (req.tools.length) return { toolCalls: [{ id: 't1', name: 'somar', arguments: { a: 17, b: 25 } }] };
    return { text: 'pronto' };
  },
};

test('verificador aprova um adaptador que faz o que o Orbi precisa', async () => {
  const results = await checkAdapter(capable);
  assert.deepEqual(results.map((r) => r.ok), [true, true, true, true]);
});

test('verificador aponta o que falta: modelo sem function calling', async () => {
  const textOnly: LlmAdapter = { name: 'so-texto', models: [{ id: 'm' }], async chat() { return { text: 'A soma é 42.' }; } };
  const results = await checkAdapter(textOnly);
  const call = results.find((r) => r.name === 'Chamada de ferramenta')!;
  assert.equal(call.ok, false);
  assert.match(call.detail, /não chamou "somar"/);
  assert.match(call.hint!, /toolCalls/);
  assert.equal(results.length, 3, 'não testa o resultado se não houve chamada');
});

test('verificador mostra o erro do gateway', async () => {
  const down: LlmAdapter = { name: 'fora', models: [{ id: 'm' }], async chat() { throw new Error('HTTP 401: token expirado'); } };
  const results = await checkAdapter(down);
  assert.match(results[1].detail, /HTTP 401: token expirado/);
});

test('plugin:new gera um plugin que carrega, e plugin:test o testa contra o LLM', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const dir = mkdtempSync(join(tmpdir(), 'orbi-new-'));
  const env = { ...process.env, ORBI_PLUGINS_DIR: dir };
  execFileSync('node', [join(root, 'scripts/plugin-new.mjs'), 'gateway-teste'], { env });
  const code = readFileSync(join(dir, 'gateway-teste', 'index.mjs'), 'utf8');
  assert.match(code, /name: 'gateway-teste'/);
  const [info] = await discoverPlugins([dir]);
  assert.equal(info.name, 'gateway-teste');
  assert.ok(info.plugin, info.error);

  // The template talks to `${baseUrl}/gerar`; a mock of that "company API" makes it pass end to end.
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      const last = body.mensagens.at(-1);
      const out = last?.role === 'tool' ? { texto: 'Dá 42.' } : body.ferramentas.length ? { chamadas: [{ id: 'k1', nome: 'somar', argumentos: { a: 17, b: 25 } }] } : { texto: 'pronto' };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    // Async: the mock server lives in this process and must keep answering.
    const { stdout: output } = await promisify(execFile)('npx', ['tsx', 'scripts/plugin-test.ts', 'gateway-teste'], {
      cwd: resolve(root, 'apps/runtime'),
      env: { ...env, ORBI_LLM_BASE_URL: `http://127.0.0.1:${port}`, ORBI_LLM_API_KEY: 'k', ORBI_LLM_MODEL: 'm1', NO_COLOR: '1' },
      encoding: 'utf8',
    });
    assert.match(output, /Tudo certo\. Para usar: ORBI_LLM=gateway-teste/);
  } finally {
    server.close();
  }
});

test('plugins: a pasta do app instalado vale também para o npm start, e vem primeiro', () => {
  assert.equal(appDataHome({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32', 'C:\\Users\\a').endsWith('br.com.zup.orbi'), true);
  assert.equal(appDataHome({}, 'darwin', '/Users/a'), '/Users/a/Library/Application Support/br.com.zup.orbi');
  assert.equal(appDataHome({}, 'linux', '/home/a'), '/home/a/.local/share/br.com.zup.orbi');
  const home = mkdtempSync(join(tmpdir(), 'orbi-home-'));
  mkdirSync(join(home, 'plugins'));
  const repo = mkdtempSync(join(tmpdir(), 'orbi-repo-'));
  mkdirSync(join(repo, 'plugins'));
  mkdirSync(join(repo, 'apps', 'runtime'), { recursive: true });
  assert.deepEqual(pluginDirs({}, join(repo, 'apps', 'runtime'), home), [join(home, 'plugins'), join(repo, 'plugins')]);
});
