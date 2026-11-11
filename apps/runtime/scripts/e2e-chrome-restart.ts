/**
 * End-to-end check of the Chrome settings (docs/funcionalidades/20, fase 2), no LLM involved:
 * the runtime's own bridge (startBackground) with a real Chrome, the settings saved as the
 * Autonomia screen saves them, the restart, and the browser working again with the new settings.
 *
 *   npm run e2e:chrome-settings
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { createOrbi, startBackground } from '../src/compose.ts';
import { applyChromeSettings } from '../src/browser/settings.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`ok  ${message}`);
}
async function until<T>(what: string, get: () => T | undefined, ms = 30_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`FALHOU: ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

// A folder of its own: the .env written here is not the developer's.
const cwd = mkdtempSync(join(tmpdir(), 'orbi-chrome-settings-'));
const env: NodeJS.ProcessEnv = {
  ...process.env, ORBI_VAULT: 'file', CHROME_HEADLESS: 'true', CHROME_MCP_AUTOSTART: 'true',
  CHROME_MCP_PORT: '8941', CHROME_DEBUG_PORT: '9343', ORBI_FOLLOWUP_INTERVAL_MS: '3600000',
};
const s = await createOrbi(loadConfig(env, cwd), {}, {});
const bg = startBackground(s, {} as never);
try {
  const first = await until('a ponte subiu', () => bg.bridge());
  assert(first.toolNames.includes('list_pages'), `ponte com ${first.toolNames.length} ferramentas`);
  assert(/about:blank|Page/i.test(await s.browser.call('list_pages', {})), 'o navegador do Orbi responde');

  // Saved as the screen saves: own profile, a different profile folder, still without a window.
  const profile = join(cwd, 'outro-perfil');
  const r = applyChromeSettings({ browser: 'proprio', browserUrl: null, showWindow: false, autostart: true, profileDir: profile, executablePath: null }, s.config, env);
  assert('settings' in r && r.settings.profileDir === profile, 'configuração aplicada na hora');
  assert(readFileSync(join(cwd, '.env'), 'utf8').includes(`CHROME_PROFILE_DIR='${profile}'`), 'gravada no .env');
  await bg.restartChrome();
  const second = await until('a ponte voltou', () => bg.bridge());
  assert(second !== first, 'a ponte foi reiniciada');
  assert(/about:blank|Page/i.test(await s.browser.call('list_pages', {})), 'o navegador volta a responder depois de reiniciar');
  assert(readFileSync(join(profile, 'Local State'), 'utf8').length > 0, 'o Chrome abriu com o perfil novo');

  // Turned off: no bridge, and the screen says so.
  applyChromeSettings({ browser: 'proprio', browserUrl: null, showWindow: false, autostart: false, profileDir: profile, executablePath: null }, s.config, env);
  await bg.restartChrome();
  assert(!bg.bridge() && bg.bridgeError() === 'desligado', 'desligado: sem ponte');
  console.log('\nE2E configurações do Chrome: tudo certo.');
} finally {
  await bg.stop();
}
process.exit(0);
