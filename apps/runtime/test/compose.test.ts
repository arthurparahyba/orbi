/**
 * Composition root: configuration is pure and validated, parts can be swapped,
 * and importing Orbi's modules creates nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

test('importar os módulos não cria arquivos nem serviços', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-import-'));
  const before = process.cwd();
  process.chdir(cwd);
  try {
    await import('../src/agents/orbi.ts');
    await import('../src/http/app.ts');
    await import('../src/compose.ts');
    assert.equal(existsSync(join(cwd, 'data')), false, 'nada em data/');
    const { services } = await import('../src/services.ts');
    assert.throws(() => services(), /não foi inicializado/);
  } finally {
    process.chdir(before);
  }
});

test('loadConfig é pura: lê só o ambiente passado, resolve ~ e caminhos relativos', async () => {
  const { loadConfig } = await import('../src/config.ts');
  const c = loadConfig({ ORBI_WORKSPACE: '~/projetos', ORBI_DATA_DIR: 'dados', ORBI_ALLOWED_BINARIES: 'git, gh' }, '/base');
  assert.equal(c.workspace, join(homedir(), 'projetos'));
  assert.equal(c.dataDir, '/base/dados');
  assert.equal(c.brainFile, '/base/dados/brain.db');
  assert.deepEqual(c.allowedBinaries, ['git', 'gh']);
  assert.equal(c.llm, 'anthropic');
  assert.equal(c.codeFixer, true);
  const other = loadConfig({ ORBI_LLM: 'gateway', ORBI_LLM_MODEL: 'm' }, '/base');
  assert.equal(other.model, 'orbi-llm/m');
  assert.equal(other.codeFixer, false);
});

test('configuração inválida é explicada antes de subir', async () => {
  const { loadConfig, validateConfig } = await import('../src/config.ts');
  const { createOrbi } = await import('../src/compose.ts');
  const bad = loadConfig({ CHROME_MCP_PORT: 'abc', ORBI_STT: 'http', ORBI_VAULT: 'cofre' }, mkdtempSync(join(tmpdir(), 'orbi-bad-')));
  const problems = validateConfig(bad);
  assert.ok(problems.some((p) => p.startsWith('CHROME_MCP_PORT')));
  assert.ok(problems.some((p) => p.includes('ORBI_STT_URL')));
  assert.ok(problems.some((p) => p.startsWith('ORBI_VAULT')));
  await assert.rejects(createOrbi(bad), /configuração inválida/);
});

test('createOrbi monta as peças e aceita substitutas', async () => {
  const { loadConfig } = await import('../src/config.ts');
  const { createOrbi } = await import('../src/compose.ts');
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-compose-'));
  const config = loadConfig({ ORBI_VAULT: 'file', CHROME_MCP_AUTOSTART: 'false' }, cwd);
  const fakeStt = { get: () => ({ name: 'falsa', transcribe: async () => 'oi' }), set() {}, name: () => 'falsa' };
  const orbi = await createOrbi(config, { stt: fakeStt }, {});
  assert.equal(orbi.stt.name(), 'falsa');
  assert.equal(orbi.config.model, 'anthropic/claude-haiku-5-5');
  assert.ok(orbi.codeFixer, 'Claude Code ligado com a Anthropic');
  assert.ok(existsSync(join(cwd, 'data')), 'pastas criadas só por createOrbi');
  orbi.brain.upsertEntity({ id: 'x', type: 'Classe', props: {}, body: '' });
  assert.equal(orbi.brain.get('x')?.type, 'Classe');
  // The recorder got the substitute transcriber, not a global one.
  assert.equal(orbi.recorder.active(), undefined);
});
