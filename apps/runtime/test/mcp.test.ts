/**
 * Orbi as an MCP server: tokens per agent, permissions, search and teaching
 * through a real MCP client over the HTTP app (no network). Delegation, which
 * runs the agent, is in agent-flow.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig } from '../src/config.ts';
import { createOrbi } from '../src/compose.ts';
import { createHttpApp } from '../src/http/app.ts';
import { Orbi } from '../src/agents/orbi.ts';
import { requestStatus } from '../src/mcp/status.ts';
import { procedureName } from '../src/mcp/tools.ts';

const background = { bridge: () => undefined, bridgeError: () => 'desligado', stop: async () => {} };

async function setup(env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-mcp-'));
  const orbi = await createOrbi(loadConfig({ ORBI_VAULT: 'file', CHROME_MCP_AUTOSTART: 'false', ...env }, cwd), {}, {});
  const app = createHttpApp(orbi, background, Orbi);
  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, json: (await res.json()) as any };
  };
  const connect = async (token: string) => {
    const client = new Client({ name: 'teste', version: '0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3000/mcp'), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: async (url, init) => app.request(String(url), init as RequestInit),
      }),
    );
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
    return { isError: !!res.isError, text: res.content[0].text, json: res.isError ? undefined : JSON.parse(res.content[0].text) };
  };
  return { orbi, app, api, connect, call };
}

const playbook = {
  name: 'publicar-versao-no-portal',
  description: 'Publicar a versão de um front-end no portal interno depois do deploy.',
  trigger: 'deploy concluído',
  appliesTo: null,
  autonomy: 'ask' as const,
  steps: [
    { id: 'abrir', label: 'Abrir o portal', how: 'navegar até {{url}}' },
    { id: 'salvar', label: 'Salvar a versão {{versao}}', how: 'login com {{segredo:portal}}' },
  ],
  instructions: '',
  learnedFrom: null,
  variationOf: null,
};

test('mcp: sem token, token errado ou revogado não entra; o token aparece uma vez', async () => {
  const { app, api, connect } = await setup();
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '0' } } };
  const post = (headers: Record<string, string>) =>
    app.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(init) });

  assert.equal((await post({})).status, 401);
  assert.equal((await post({ authorization: 'Bearer orb_errado' })).status, 401);

  const created = await api('POST', '/api/agents/clients', { name: 'Claude Code · notebook' });
  assert.equal(created.status, 201);
  assert.match(created.json.token, /^orb_/);
  const listed = await api('GET', '/api/agents/clients');
  assert.equal(JSON.stringify(listed.json).includes(created.json.token), false, 'a lista nunca devolve o token');

  // Another host name (DNS rebinding) is turned away even with a good token.
  const rebinding = await app.request('http://orbi.evil.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${created.json.token}` },
    body: JSON.stringify(init),
  });
  assert.equal(rebinding.status, 401);

  const client = await connect(created.json.token);
  assert.ok((await client.listTools()).tools.length > 0);
  assert.ok((await api('GET', '/api/agents/clients')).json[0].lastSeenAt, 'a conexão marca quando o agente apareceu');

  await api('DELETE', `/api/agents/clients/${created.json.client.id}`);
  assert.equal((await post({ authorization: `Bearer ${created.json.token}` })).status, 401, 'revogado para de funcionar na hora');
});

test('mcp: o ORBI_API_TOKEN do app não vale para o /mcp, e vice-versa', async () => {
  const { api, connect } = await setup({ ORBI_API_TOKEN: 'segredo-do-app' });
  const app = { authorization: 'Bearer segredo-do-app' };
  const { json } = await api('POST', '/api/agents/clients', { name: 'Cursor' }, app);
  const client = await connect(json.token);
  assert.ok((await client.listTools()).tools.length);
  assert.equal((await api('GET', '/api/agents/clients', undefined, { authorization: `Bearer ${json.token}` })).status, 401);
});

test('mcp: permissões escolhem as ferramentas que o agente vê', async () => {
  const { api, connect } = await setup();
  const { json } = await api('POST', '/api/agents/clients', { name: 'Cursor' });
  const names = async () => (await (await connect(json.token)).listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(await names(), ['orbi_delegate', 'orbi_procedure', 'orbi_search', 'orbi_status', 'orbi_teach']);
  await api('PATCH', `/api/agents/clients/${json.client.id}`, { canDelegate: false, canTeach: false });
  assert.deepEqual(await names(), ['orbi_procedure', 'orbi_search']);
});

test('mcp: buscar e ler um procedimento (divulgação aos poucos)', async () => {
  const { orbi, api, connect, call } = await setup();
  orbi.brain.savePlaybook(playbook);
  const { json } = await api('POST', '/api/agents/clients', { name: 'Claude Code' });
  const client = await connect(json.token);

  const found = await call(client, 'orbi_search', { query: 'publicar versão do front no portal' });
  assert.equal(found.json.procedures[0].name, 'publicar-versao-no-portal');
  assert.equal(found.json.procedures[0].steps, 2);
  assert.equal(found.json.procedures[0].how, undefined, 'a busca não traz os passos');
  assert.match((await call(client, 'orbi_search', { query: 'abrir chamado de férias' })).json.hint, /orbi_teach/);
  assert.equal((await call(client, 'orbi_search', {})).json.procedures.length, 1, 'sem consulta lista os mais usados');

  const read = await call(client, 'orbi_procedure', { name: 'publicar-versao-no-portal' });
  assert.deepEqual(read.json.parameters, ['url', 'versao'], 'credenciais não são parâmetros');
  assert.equal(read.json.steps[1].label, 'Salvar a versão {{versao}}');

  const missing = await call(client, 'orbi_procedure', { name: 'nao-existe' });
  assert.equal(missing.isError, true);
  const bad = await call(client, 'orbi_delegate', { procedure: 'nao-existe', task: 'x' });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /orbi_search/);
  const invalid = await call(client, 'orbi_search', { limit: 99 });
  assert.equal(invalid.isError, true);
});

test('mcp: ensinar vira sugestão; repetir conta; aceitar grava pedindo aprovação', async () => {
  const { orbi, api, connect, call } = await setup();
  orbi.brain.savePlaybook(playbook);
  const a = await connect((await api('POST', '/api/agents/clients', { name: 'Claude Code' })).json.token);
  const b = await connect((await api('POST', '/api/agents/clients', { name: 'Cursor' })).json.token);
  const teach = {
    name: 'Publicar versão no portal de homologação',
    description: 'Publicar a versão do front no portal de homologação depois do deploy.',
    trigger: 'deploy em homologação',
    steps: [{ label: 'Abrir o portal', how: 'portal-hml' }, { label: 'Abrir o portal', how: 'aba Versões' }, { label: 'Salvar', how: 'botão Salvar' }],
    why: 'toda sprint',
  };

  const first = await call(a, 'orbi_teach', teach);
  assert.equal(first.json.status, 'nova');
  assert.deepEqual(first.json.similar_to, ['publicar-versao-no-portal'], 'aponta o que o Orbi já sabe parecido');
  assert.equal(orbi.brain.playbook('publicar-versao-no-portal-de-homologacao'), undefined, 'nada vai direto para o cérebro');

  const again = await call(b, 'orbi_teach', teach);
  assert.equal(again.json.status, 'repetida');
  assert.equal(again.json.times_suggested, 2);

  const [s] = (await api('GET', '/api/agents/suggestions')).json;
  assert.equal(s.name, 'publicar-versao-no-portal-de-homologacao');
  assert.deepEqual(s.agents, ['Claude Code', 'Cursor']);
  assert.deepEqual(s.steps.map((x: any) => x.id), ['abrir-o-portal', 'abrir-o-portal-2', 'salvar']);

  const accepted = await api('POST', `/api/agents/suggestions/${s.id}/accept`, { variationOf: 'publicar-versao-no-portal' });
  assert.equal(accepted.status, 200);
  const pb = orbi.brain.playbook('publicar-versao-no-portal-de-homologacao')!;
  assert.equal(pb.autonomy, 'ask', 'aceito, começa perguntando antes de agir');
  assert.equal(pb.variationOf, 'publicar-versao-no-portal');
  assert.equal(pb.learnedFrom, 'agente: Claude Code, Cursor');
  assert.equal((await api('POST', `/api/agents/suggestions/${s.id}/reject`)).status, 409, 'já decidida');

  // A new suggestion with the name of a known procedure can only be rejected.
  const clash = await call(a, 'orbi_teach', { ...teach, name: 'publicar-versao-no-portal' });
  const conflict = await api('POST', `/api/agents/suggestions/${clash.json.suggestion_id}/accept`, {});
  assert.equal(conflict.status, 409);
  assert.equal((await api('POST', `/api/agents/suggestions/${clash.json.suggestion_id}/reject`)).json.status, 'rejected');
  assert.equal((await api('GET', '/api/agents/suggestions')).json.length, 0, 'nada aberto');
});

test('status: rodando, esperando o desenvolvedor, concluído', () => {
  const req = {
    id: 'req_1', clientId: 'c', agent: 'Claude Code', conversationId: 'chat:1', task: 't', procedure: 'p',
    context: {}, status: 'running' as const, summary: null, links: [], createdAt: '', finishedAt: null,
  };
  const run = {
    id: 'r', playbook: 'p', conversationId: 'chat:1', status: 'running' as const, startedAt: '', finishedAt: null,
    steps: [{ id: 'a', label: 'Build', how: '', status: 'done' as const }, { id: 'b', label: 'Deploy em dev', how: '', status: 'running' as const }],
  };
  assert.equal(requestStatus(req, run, []).step, '2/2 Deploy em dev');
  const approval = { id: 'i', kind: 'approval' as const, conversationId: 'chat:1', title: 'Rodar deploy.yml', detail: '', createdAt: '', status: 'open' as const };
  const waiting = requestStatus(req, run, [approval]);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.waiting_for, 'aprovação do desenvolvedor: Rodar deploy.yml');
  const other = requestStatus(req, run, [{ ...approval, conversationId: 'chat:2' }]);
  assert.equal(other.status, 'running', 'pendência de outra conversa não conta');
  const done = requestStatus({ ...req, status: 'done', summary: 'ok', links: ['https://ci/1'] }, run, []);
  assert.deepEqual([done.status, done.summary, done.links], ['done', 'ok', ['https://ci/1']]);
  assert.equal(procedureName('  Publicar Versão — HML!  '), 'publicar-versao-hml');
});
