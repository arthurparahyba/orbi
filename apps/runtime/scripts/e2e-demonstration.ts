/**
 * End-to-end: teach by demonstration, then re-run with the vault.
 *
 *  1. Start a fake portal and a recording on the shared Chrome (headless here).
 *  2. A "developer" (a second CDP client) logs in, opens a micro-frontend, goes
 *     to the Configuração tab and changes the version, while narration segments
 *     arrive (fake transcriber).
 *  3. Check: steps described semantically, credentials went to the vault and
 *     appear nowhere in the recording or the message for the agent.
 *  4. Re-run through chrome-devtools-mcp (the agent's path): log out, then log in
 *     filling {{segredo:…}} references resolved from the vault, set another
 *     version, and confirm on the portal.
 *
 *   npm run e2e:demo
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'orbi-demo-e2e-'));
Object.assign(process.env, {
  ORBI_DATA_DIR: dir,
  ORBI_FLUE_DB: join(dir, 'flue.db'),
  CHROME_HEADLESS: process.env.CHROME_HEADLESS ?? 'true',
  CHROME_DEBUG_PORT: '9447',
  CHROME_MCP_PORT: '8947',
  ORBI_VAULT: 'file',
});

const { startFakePortal, FAKE_PORTAL_CREDENTIALS } = await import('./fake-portal.ts');
const { demonstrationMessage } = await import('../src/browser/recorder.ts');
const { redact } = await import('../src/vault.ts');
const { startBridge } = await import('../src/mcp/bridge.ts');
const { loadConfig } = await import('../src/config.ts');
const { createOrbi } = await import('../src/compose.ts');
// The same parts the server uses, built by the composition root.
const orbi = await createOrbi(loadConfig({ ...process.env, CHROME_MCP_AUTOSTART: 'false' }));
const { recorder, vault, config } = orbi;
const ensureChrome = () => orbi.chrome.ensure();
const chromeDebugUrl = () => orbi.chrome.debugUrl();
const stopChrome = () => orbi.chrome.stop();
const callBrowserTool = (tool: string, args: Record<string, unknown>) => orbi.browser.call(tool, args);
const puppeteer = (await import('puppeteer-core')).default;

const step = (s: string) => console.log(`\n▸ ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const phrases = [
  'Vou te mostrar como atualizo a versão de um micro front no portal interno.',
  'Primeiro entro com meu usuário e senha.',
  'Aí abro o MFE que acabou de ser deployado, nesse caso o novo-front.',
  'Na aba configuração tem o campo versão, eu coloco a versão que foi pro ar em dev e salvo.',
  'Faz isso sempre que terminar o deploy de um MFE em dev.',
];
let said = 0;
orbi.stt.set({ name: 'fake', transcribe: async () => phrases[said++] ?? '' });
const silentWav = (seconds = 1) => {
  const samples = 16_000 * seconds, data = Buffer.alloc(samples * 2), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16_000, 24);
  h.writeUInt32LE(32_000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};
const narrate = (rec: { id: string }) => recorder.addAudio(rec.id, Date.now(), 1000, silentWav());

const portal = await startFakePortal();
try {
  step(`Portal falso em ${portal.url}; iniciando gravação`);
  const rec = await recorder.start('chat:e2e', { url: `${portal.url}/login`, narrated: true });
  narrate(rec);

  // The developer, in the same Chrome.
  const dev = await puppeteer.connect({ browserURL: await ensureChrome(), defaultViewport: null });
  const pages = await dev.pages();
  const tab = pages.find((p) => p.url().includes('/login'))!;
  await tab.waitForSelector('#u');
  narrate(rec);
  await tab.type('#u', FAKE_PORTAL_CREDENTIALS.user);
  await tab.type('#p', FAKE_PORTAL_CREDENTIALS.password);
  await Promise.all([tab.waitForNavigation(), tab.click('button[type=submit]')]);
  narrate(rec);
  await Promise.all([tab.waitForNavigation(), tab.click('a[href="/apps/novo-front"]')]);
  await Promise.all([tab.waitForNavigation(), tab.click('a[role=tab][href$="/config"]')]);
  narrate(rec);
  await tab.click('#v', { count: 3 });
  await tab.type('#v', '2.4.0');
  await Promise.all([tab.waitForNavigation(), tab.click('form[aria-label="Configuração do MFE"] button')]);
  narrate(rec);
  await sleep(500);
  await dev.disconnect();

  step('Parando a gravação');
  const done = await recorder.stop(rec.id);
  for (const a of done.actions) console.log(`  [${(a.t / 1000).toFixed(1)}s] ${a.text}`);
  console.log(`  narração: ${done.narration.filter((n) => n.status === 'done').length} trechos`);

  assert.equal(portal.state.versions['novo-front'], '2.4.0', 'o portal recebeu a versão');
  const kinds = done.actions.map((a) => a.kind).join(',');
  assert.match(kinds, /navigate.*fill.*fill.*click.*navigate.*click.*navigate.*click.*navigate.*fill.*click/);
  assert.ok(done.actions.some((a) => a.kind === 'fill' && a.target?.label === 'Versão' && a.value === '2.4.0'), 'versão registrada pelo rótulo');
  assert.ok(done.actions.some((a) => a.kind === 'click' && a.target?.role === 'tab' && a.target?.name === 'Configuração'), 'aba reconhecida como tab');
  assert.deepEqual(done.secrets.sort(), ['127.0.0.1/senha', '127.0.0.1/usuario']);

  const message = demonstrationMessage(done);
  const everything = JSON.stringify(done) + message;
  assert.ok(!everything.includes(FAKE_PORTAL_CREDENTIALS.password), 'a senha não aparece na gravação nem na mensagem');
  assert.ok(!everything.includes(`"${FAKE_PORTAL_CREDENTIALS.user}"`), 'o usuário também foi para o cofre');
  assert.equal(await vault.get('127.0.0.1/senha'), FAKE_PORTAL_CREDENTIALS.password);
  assert.match(message, /FALA {2}"Na aba configuração/);
  console.log('\n--- mensagem para o agente ---\n' + message + '\n---');

  step('Reexecutando pelo caminho do agente (chrome-devtools-mcp + cofre)');
  const bridge = await startBridge({
    port: config.chrome.port, token: config.chrome.token,
    chrome: { browserUrl: chromeDebugUrl() }, beforeToolCall: async () => { await ensureChrome(); },
  });
  try {
    const pagesText = await callBrowserTool('list_pages', {});
    const pageId = Number(pagesText.match(/^(\d+): .*\/apps\/novo-front/m)?.[1]);
    await callBrowserTool('select_page', { pageId, bringToFront: true });
    await callBrowserTool('navigate_page', { pageId, url: `${portal.url}/logout` });
    const uidOf = (snap: string, label: string, role = '(?:textbox|button)') => snap.match(new RegExp(`uid=(\\S+) ${role} "${label}"`))?.[1];
    let snap = await callBrowserTool("take_snapshot", { pageId });
    const act = async (tool: string, args: Record<string, unknown>) => {
      const { value, used } = await vault.resolve(args);
      return redact(await callBrowserTool(tool, { pageId, ...value }), used);
    };
    await act('fill', { uid: uidOf(snap, 'Usuário'), value: '{{segredo:127.0.0.1/usuario}}' });
    const out = await act('fill', { uid: uidOf(snap, 'Senha'), value: '{{segredo:127.0.0.1/senha}}' });
    assert.ok(!out.includes(FAKE_PORTAL_CREDENTIALS.password), 'saída da ferramenta sem a senha');
    await act('click', { uid: uidOf(snap, 'Entrar') });
    await sleep(1000); // let the login POST and redirect finish before navigating
    await callBrowserTool('navigate_page', { pageId, url: `${portal.url}/apps/novo-front/config` });
    snap = await callBrowserTool("take_snapshot", { pageId });
    await act('fill', { uid: uidOf(snap, 'Versão'), value: '2.5.0' });
    await act('click', { uid: uidOf(snap, 'Salvar') });
    await sleep(800);
    assert.equal(portal.state.logins, 2, 'logou de novo com as credenciais do cofre');
    assert.equal(portal.state.versions['novo-front'], '2.5.0');
    console.log('  login com {{segredo:…}} ok; versão 2.5.0 salva no portal');
  } finally {
    await bridge.close();
  }
  console.log('\n✔ demonstração gravada, credenciais no cofre, reexecução ok');
} finally {
  await portal.close();
  stopChrome();
}
process.exit(0);
