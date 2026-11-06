/**
 * End-to-end check of the browser path, no LLM involved:
 *   chrome-devtools-mcp (stdio) ← bridge (HTTP, token) ← Flue createMcpConnection / Orbi client
 * against a tiny local "portal" whose version field must be updated — the
 * same task the Orbi learns in the prototype.
 *
 *   npm run e2e:chrome            (uses the system Chrome, headless)
 */
import { createServer } from 'node:http';
import { createMcpConnection } from '@flue/runtime';
import { startBridge } from '../src/mcp/bridge.ts';
import { loadConfig } from '../src/config.ts';

const config = loadConfig();
const browserMcp = createBrowserMcp({ port: config.chrome.port, token: config.chrome.token });
const callBrowserTool = (tool: string, args: Record<string, unknown>) => browserMcp.call(tool, args);
import { createBrowserMcp } from '../src/mcp/chrome-devtools.ts';
import { BROWSER_READ_TOOLS } from '../src/policy/autonomy.ts';

const PORTAL_HTML = `<!doctype html><html lang="pt-BR"><head><title>Portal interno — menus</title></head><body>
<h1>Menu: Portal Clientes</h1>
<label for="versao">Versão</label><input id="versao" value="2.13.4">
<button id="salvar" onclick="document.getElementById('status').textContent='Versão salva: '+document.getElementById('versao').value">Salvar</button>
<p id="status">Sem alterações</p></body></html>`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`ok  ${message}`);
}

const portal = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PORTAL_HTML));
await new Promise<void>((r) => portal.listen(0, '127.0.0.1', () => r()));
const portalUrl = `http://127.0.0.1:${(portal.address() as { port: number }).port}/admin/menus`;

const bridge = await startBridge({
  port: config.chrome.port,
  token: config.chrome.token,
  chrome: { headless: true, isolated: true, executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' },
});
console.log(`bridge: ${bridge.url} (${bridge.toolNames.length} tools upstream)`);

try {
  // 1. The bridge refuses calls without the token.
  const anon = await fetch(bridge.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert(anon.status === 401, 'bridge recusa chamada sem token (401)');

  // 2. Flue's own MCP client connects through the bridge and adapts the allowlisted tools.
  const flueConn = await createMcpConnection({
    name: 'chrome',
    url: bridge.url,
    auth: config.chrome.token,
    tools: [...BROWSER_READ_TOOLS],
  });
  const names = flueConn.tools.map((t) => t.name);
  assert(names.length === BROWSER_READ_TOOLS.length, `Flue createMcpConnection montou ${names.length} tools de leitura`);
  assert(names.some((n) => n.includes('navigate_page')), `nomes no padrão do Flue: ${names[0]}, …`);

  // Flue executes adapted MCP tools only inside an agent turn (its internal adapter),
  // so the calls below go through Orbi's own client to the same bridge.
  await flueConn.close();

  // 3. Open the portal. Page-id routing is on (one page per conversation), so every
  //    page-scoped call names its page.
  const pages = await callBrowserTool('list_pages', {});
  const pageId = Number(/^(\d+):/m.exec(pages)?.[1]);
  assert(Number.isFinite(pageId), `list_pages devolveu a página ${pageId}`);
  const nav = await callBrowserTool('navigate_page', { pageId, type: 'url', url: portalUrl });
  assert(nav.includes('127.0.0.1'), 'navigate_page abriu o portal');

  // 4. Read the page, then act on it through Orbi's gated path (browser_act → callBrowserTool).
  const snapshot = await callBrowserTool('take_snapshot', { pageId });
  assert(snapshot.includes('2.13.4'), 'take_snapshot mostra a versão atual 2.13.4');
  const fieldUid = /uid=(\S+) textbox "Versão"/.exec(snapshot)?.[1];
  const buttonUid = /uid=(\S+) button "Salvar"/.exec(snapshot)?.[1];
  assert(fieldUid && buttonUid, `achou campo (${fieldUid}) e botão (${buttonUid}) no snapshot`);

  await callBrowserTool('fill', { pageId, uid: fieldUid, value: '2.14.0' });
  await callBrowserTool('click', { pageId, uid: buttonUid });
  const after = await callBrowserTool('take_snapshot', { pageId });
  assert(after.includes('Versão salva: 2.14.0'), 'fill + click atualizaram a versão para 2.14.0');

  console.log('\nE2E Chrome DevTools MCP: tudo certo.');
} finally {
  await bridge.close();
  portal.close();
}
process.exit(0);
