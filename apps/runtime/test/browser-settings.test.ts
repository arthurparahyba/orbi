import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { applyChromeSettings, browserUrlProblem, chromeSettings } from '../src/browser/settings.ts';
import { Hono } from 'hono';
import { browserRoutes } from '../src/http/routes/browser.ts';
import { installErrorHandling } from '../src/http/errors.ts';

/** Orbi's browser configured from Autonomia › Ferramentas (MCP) (docs/funcionalidades/20, fase 2). */

const base = { browser: 'proprio' as const, browserUrl: null, showWindow: true, autostart: true, profileDir: null, executablePath: null };

test('navegador: o que vem do .env aparece na tela', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-chrome-'));
  const c = loadConfig({ CHROME_HEADLESS: 'true', CHROME_MCP_AUTOSTART: 'false' }, cwd);
  const s = chromeSettings(c.chrome);
  assert.equal(s.browser, 'proprio');
  assert.equal(s.showWindow, false);
  assert.equal(s.autostart, false);
  assert.equal(s.profileDir, join(cwd, 'data', 'chrome-profile'));
  assert.equal(s.debugPort, 9333);
  assert.ok(s.detected || s.detectError, 'diz qual Chrome achou, ou por que não achou');
  // An empty value (written when a setting is cleared) means the default.
  assert.equal(loadConfig({ CHROME_BROWSER_URL: '', CHROME_PATH: '' }, cwd).chrome.browserUrl, undefined);
});

test('navegador: o seu Chrome só nesta máquina', () => {
  assert.equal(browserUrlProblem('http://127.0.0.1:9222'), undefined);
  assert.equal(browserUrlProblem('http://localhost:9222'), undefined);
  assert.match(browserUrlProblem('http://10.0.0.5:9222')!, /endereço local/);
  assert.match(browserUrlProblem('https://127.0.0.1:9222')!, /endereço local/);
  assert.match(browserUrlProblem('http://127.0.0.1')!, /porta/);
  assert.match(browserUrlProblem('nada')!, /inválido/);
});

test('navegador: salvar grava no .env, vale na hora e limpar volta ao padrão', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-chrome-'));
  const config = loadConfig({}, cwd);
  const env: NodeJS.ProcessEnv = {};
  const r = applyChromeSettings({ ...base, browser: 'seu', browserUrl: 'http://127.0.0.1:9222', showWindow: false, autostart: false }, config, env);
  assert.ok('settings' in r);
  assert.equal(r.settings.browser, 'seu');
  assert.equal(config.chrome.browserUrl, 'http://127.0.0.1:9222');
  assert.equal(config.chrome.headless, true);
  assert.equal(config.chrome.autostart, false);
  const file = readFileSync(join(cwd, '.env'), 'utf8');
  assert.match(file, /CHROME_BROWSER_URL='http:\/\/127\.0\.0\.1:9222'/);
  assert.match(file, /CHROME_HEADLESS='true'/);
  assert.equal(env.CHROME_MCP_AUTOSTART, 'false');

  applyChromeSettings(base, config, env);
  assert.equal(config.chrome.browserUrl, undefined, 'perfil próprio de novo');
  assert.equal(config.chrome.headless, false);
  assert.match(readFileSync(join(cwd, '.env'), 'utf8'), /CHROME_BROWSER_URL=''/);
  assert.equal(loadConfig(env, cwd).chrome.browserUrl, undefined, 'na próxima partida também');

  const bad = applyChromeSettings({ ...base, browser: 'seu', browserUrl: 'http://192.168.0.2:9222' }, config, env);
  assert.ok('problem' in bad);
  assert.equal(config.chrome.browserUrl, undefined, 'recusado não muda nada');
});

test('navegador: a rota salva, reinicia o navegador e recusa endereço de fora', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-chrome-'));
  const config = loadConfig({}, cwd);
  let restarts = 0;
  const keys = ['CHROME_BROWSER_URL', 'CHROME_HEADLESS', 'CHROME_MCP_AUTOSTART', 'CHROME_PROFILE_DIR', 'CHROME_PATH'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    const app = new Hono();
    installErrorHandling(app);
    app.route('/', browserRoutes({ config }, { restartChrome: async () => void restarts++ }));
    const put = (b: unknown) => app.request('/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    assert.equal(((await (await app.request('/settings')).json()) as any).browser, 'proprio');
    const ok = await put({ ...base, showWindow: false });
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as any).showWindow, false);
    assert.equal(restarts, 1);
    const bad = await put({ ...base, browser: 'seu', browserUrl: 'http://example.com:9222' });
    assert.equal(bad.status, 400);
    assert.equal(((await bad.json()) as any).error.code, 'invalid_browser_settings');
    assert.equal(restarts, 1, 'recusado não reinicia');
  } finally {
    for (const k of keys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});
