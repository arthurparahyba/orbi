import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, mcpServers, browser } from './support/flow.ts';
import { NO_BROWSER } from '../src/contexts/tools/index.ts';

/**
 * O navegador do Orbi deixou de vir embarcado (documento 31). Quem diz qual servidor MCP é o
 * navegador é o desenvolvedor, e a aplicação é instalada sem nenhum. Estes testes guardam as duas
 * coisas que isso tem de garantir: sem marcado, recusa dizendo o que fazer; e um só é o navegador.
 */

test('sem servidor marcado, o navegador recusa dizendo o que fazer', async () => {
  await assert.rejects(browser.call('navigate_page', { url: 'http://127.0.0.1' }), /servidor MCP de navegador/);
  assert.equal(browser.serverId(), undefined);
  assert.match(NO_BROWSER, /npx chrome-devtools-mcp/, 'a frase diz o comando, porque é o que a pessoa vai digitar');

  const health = (await (await app.request('/api/health')).json()) as any;
  assert.deepEqual(health.browser, { serverId: null }, 'a tela mostra que não há navegador');
});

test('marcar um servidor como navegador manda o browser_act para ele; marcar outro desmarca o primeiro', async () => {
  mcpServers.add({ id: 'chrome-npx', name: 'Chrome DevTools', transport: 'command', command: { program: 'npx', args: ['-y', 'chrome-devtools-mcp'] }, approved: true });
  mcpServers.add({ id: 'outro-navegador', name: 'Outro', transport: 'command', command: { program: 'npx', args: ['-y', 'outro-mcp'] }, approved: true });

  mcpServers.setBrowser('chrome-npx');
  assert.equal(browser.serverId(), 'chrome-npx');

  mcpServers.setBrowser('outro-navegador');
  assert.equal(browser.serverId(), 'outro-navegador', 'um só é o navegador');
  assert.equal(mcpServers.get('chrome-npx')!.isBrowser, false);

  mcpServers.setBrowser(null);
  assert.equal(browser.serverId(), undefined, 'e dá para ficar sem nenhum de novo');
});

test('um servidor desligado não é o navegador, mesmo marcado', () => {
  mcpServers.add({ id: 'navegador-desligado', name: 'Desligado', transport: 'command', command: { program: 'npx', args: ['-y', 'x'] }, approved: true });
  mcpServers.setBrowser('navegador-desligado');
  assert.equal(browser.serverId(), 'navegador-desligado');

  mcpServers.edit('navegador-desligado', { enabled: false });

  assert.equal(browser.serverId(), undefined, 'desligar o servidor tira o navegador: o Orbi não tenta falar com o que está desligado');
  mcpServers.setBrowser(null);
});

test('a marca aparece na lista e na página do servidor', async () => {
  mcpServers.add({ id: 'marcado-na-lista', name: 'Chrome', transport: 'command', command: { program: 'npx', args: ['-y', 'chrome-devtools-mcp'] }, approved: true });
  const answer = await app.request('/api/mcp-servers/marcado-na-lista/browser', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isBrowser: true }),
  });

  assert.equal(answer.status, 200);
  assert.equal(((await answer.json()) as any).isBrowser, true);
  const list = (await (await app.request('/api/mcp-servers')).json()) as any[];
  assert.deepEqual(list.filter((x) => x.isBrowser).map((x) => x.id), ['marcado-na-lista'], 'só um aparece marcado');
  mcpServers.setBrowser(null);
});
