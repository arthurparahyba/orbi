import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as v from 'valibot';
import { agentToolName, categoryOf, effectiveKind, effectOf, headerProblems, hintOf, serverIdFor, urlProblem } from '../src/mcp-client/domain.ts';
import { toValibot } from '../src/mcp-client/schema.ts';
import { McpServers } from '../src/mcp-client/store.ts';
import { McpHub } from '../src/mcp-client/hub.ts';
import { migrate } from '../src/db/database.ts';
import { decide, levelOf, parsePolicy } from '../src/autonomy/policy.ts';
import { startFakeMcp } from './support/fake-mcp.ts';

/** MCP servers the developer adds (docs/funcionalidades/20, fase 3): the rules, the store, the hub. */

test('mcp: o que a ferramenta faz vem da sua marca, senão do servidor, senão é escrita', () => {
  assert.equal(hintOf({ readOnlyHint: true }), 'leitura');
  assert.equal(hintOf({ destructiveHint: true }), 'apaga');
  assert.equal(hintOf({ readOnlyHint: false }), 'escrita');
  assert.equal(hintOf({}), null);
  assert.equal(hintOf(undefined), null);
  assert.equal(effectiveKind(null, null), 'escrita', 'sem informação conta como escrita');
  assert.equal(effectiveKind('leitura', null), 'leitura');
  assert.equal(effectiveKind('escrita', 'leitura'), 'leitura', 'a sua marca vale');
  assert.equal(effectiveKind('apaga', 'escrita'), 'apaga', 'marcar escrita não tira o "apaga"');
  assert.equal(effectOf('escrita'), 'publica');
  assert.equal(effectOf('apaga'), 'apaga');
  assert.equal(categoryOf('jira', 'apaga'), 'mcp:jira:escrita');
});

test('mcp: regras de cada servidor: leitura sozinho, escrita pergunta; dentro de procedimento, o nível', () => {
  const policy = parsePolicy({ categories: { 'mcp:jira:escrita': 'auto', 'mcp:Inválido:leitura': 'auto' } });
  assert.equal(levelOf(policy, 'mcp:sonar:leitura'), 'auto');
  assert.equal(levelOf(policy, 'mcp:sonar:escrita'), 'ask');
  assert.equal(levelOf(policy, 'mcp:jira:escrita'), 'auto');
  assert.equal('mcp:Inválido:leitura' in policy.categories, false);
  // Apagar never runs alone at N2, even with the rule on auto.
  assert.equal(decide(policy, 'mcp:jira:escrita', { autonomy: 'auto', level: 2 }, { known: true, effect: 'apaga' }), 'ask');
});

test('mcp: endereço, credenciais e nomes', () => {
  assert.equal(urlProblem('https://jira.empresa.com.br/mcp'), undefined);
  assert.equal(urlProblem('http://127.0.0.1:9100/mcp'), undefined);
  assert.match(urlProblem('http://jira.empresa.com.br/mcp')!, /https/);
  assert.match(urlProblem('ftp://x')!, /https/);
  const vault = (n: string) => n === 'jira/token';
  assert.deepEqual(headerProblems({ Authorization: 'Bearer {{segredo:jira/token}}', 'X-Projeto': 'PAG' }, vault), []);
  assert.match(headerProblems({ Authorization: 'Bearer abc123' }, vault)[0]!, /só pelo cofre/);
  assert.match(headerProblems({ 'X-Api-Key': '{{segredo:outro}}' }, vault)[0]!, /não está no cofre/);
  assert.equal(serverIdFor('Jira da Empresa', []), 'jira-da-empresa');
  assert.equal(serverIdFor('Jira', ['jira']), 'jira-2');
  assert.equal(serverIdFor('Chrome', []), 'chrome-2', 'chrome é do navegador embutido');
  assert.equal(agentToolName('jira-da-empresa', 'create.issue'), 'jira_da_empresa__create_issue');
});

test('mcp: o esquema da ferramenta vira o do agente', () => {
  const schema = toValibot({ type: 'object', required: ['projeto'], properties: {
    projeto: { type: 'string', description: 'chave do projeto' }, prioridade: { enum: ['baixa', 'alta'] },
    pontos: { type: 'integer' }, labels: { type: 'array', items: { type: 'string' } }, extra: { type: 'object', properties: { a: { type: ['string', 'null'] } } },
  } });
  assert.deepEqual(v.parse(schema, { projeto: 'PAG', prioridade: 'alta', pontos: 3, labels: ['x'], extra: { a: null } }), { projeto: 'PAG', prioridade: 'alta', pontos: 3, labels: ['x'], extra: { a: null } });
  assert.equal(v.safeParse(schema, { prioridade: 'alta' }).success, false, 'obrigatório falta');
  assert.equal(v.safeParse(schema, { projeto: 'PAG', prioridade: 'média' }).success, false, 'fora da lista');
  assert.equal(v.safeParse(schema, { projeto: 'PAG', outro: 1 }).success, true, 'campo a mais passa: o servidor confere');
  assert.equal(v.safeParse(toValibot(undefined), { qualquer: 1 }).success, true);
});

test('mcp: ferramenta nova entra ligada e sinalizada; a que apaga entra desligada; a marca fica', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const store = new McpServers(db);
  store.add({ id: 'jira', name: 'Jira', url: 'https://x/mcp', headers: {} });
  const t = (name: string, hint: 'leitura' | 'escrita' | 'apaga' | null) => ({ name, description: name, inputSchema: {}, hint });
  store.sync('jira', [t('buscar', 'leitura'), t('criar', 'escrita')], new Map([['criar', { kind: null, enabled: true }], ['buscar', { kind: null, enabled: true }]]));
  store.setTool('jira', 'criar', { kind: 'leitura' });
  store.sync('jira', [t('buscar', 'leitura'), t('criar', 'escrita'), t('comentar', null), t('apagar', 'apaga')]);
  const tools = Object.fromEntries(store.tools('jira').map((x) => [x.name, x]));
  assert.equal(tools.criar!.effective, 'leitura', 'a marca continua depois de reconectar');
  assert.equal(tools.comentar!.isNew, true);
  assert.equal(tools.comentar!.effective, 'escrita');
  assert.equal(tools.comentar!.enabled, true, 'disponível na hora, pedindo aprovação');
  assert.equal(tools.apagar!.enabled, false, 'a que apaga começa desligada');
  assert.equal(tools.buscar!.isNew, false);
  assert.deepEqual(store.summary(store.get('jira')!, 'conectado').counts, { leitura: 2, escrita: 1, novas: 2 });
  store.setTool('jira', 'comentar', { kind: 'escrita' });
  assert.equal(store.tools('jira').find((x) => x.name === 'comentar')!.isNew, false, 'marcou, deixa de ser nova');
  store.setTool('jira', 'apagar', { alone: true });
  assert.equal(store.tools('jira').find((x) => x.name === 'apagar')!.alone, false, '"sempre sozinho" não vale para quem apaga');
  store.sync('jira', [t('buscar', 'leitura'), t('criar', 'escrita'), t('nova', null)]);
  store.reviewAll('jira');
  assert.equal(store.tools('jira').find((x) => x.name === 'nova')!.isNew, false, '"manter como estão" tira o destaque');
  assert.equal(store.tools('jira').find((x) => x.name === 'nova')!.effective, 'escrita', 'e continua pedindo aprovação');
  store.sync('jira', [t('buscar', 'leitura')]);
  assert.deepEqual(store.tools('jira').map((x) => x.name), ['buscar'], 'sumiu do servidor, sai daqui');
});

test('mcp: o hub conecta com a credencial do cofre e nada dela volta', async () => {
  const fake = await startFakeMcp('tok-nao-pode-vazar');
  try {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const store = new McpServers(db);
    const vault = { resolve: async <T>(x: T) => ({ value: JSON.parse(JSON.stringify(x).replaceAll('{{segredo:issues/token}}', 'tok-nao-pode-vazar')) as T, used: ['tok-nao-pode-vazar'] }) };
    const hub = new McpHub(store, vault, mkdtempSync(join(tmpdir(), 'orbi-mcp-')));
    const headers = { Authorization: 'Bearer {{segredo:issues/token}}' };
    const tested = await hub.test({ transport: 'http', url: fake.url, headers });
    assert.ok(tested.ok);
    assert.deepEqual(tested.tools.map((t) => [t.name, t.effective]).sort(), [['apagar_issue', 'apaga'], ['buscar_issue', 'leitura'], ['comentar', 'escrita'], ['criar_issue', 'escrita']]);
    const bad = await hub.test({ transport: 'http', url: fake.url, headers: { Authorization: 'Bearer errado' } });
    assert.equal(bad.ok, false);

    store.add({ id: 'issues', name: 'Issues', url: fake.url, headers });
    await hub.refresh('issues');
    assert.equal(hub.state('issues'), 'conectado');
    const text = await hub.call('issues', 'buscar_issue', { texto: 'falha' });
    assert.match(text, /achei PAG-12/);
    assert.equal(text.includes('tok-nao-pode-vazar'), false, 'o valor sai limpo');
    assert.equal(fake.calls[0]!.auth, 'Bearer tok-nao-pode-vazar', 'o servidor recebeu o valor do cofre');
    await hub.closeAll();
  } finally {
    await fake.close();
  }
});

test('mcp por comando: só roda aprovado, mudou pede de novo, ambiente só o declarado, credencial limpa', async () => {
  const { commandApproval, splitCommand, commandText } = await import('../src/mcp-client/domain.ts');
  assert.deepEqual(splitCommand('npx -y servicenow-mcp --instance "minha empresa"'), { program: 'npx', args: ['-y', 'servicenow-mcp', '--instance', 'minha empresa'] });
  assert.deepEqual(splitCommand("node 'C:\\\\mcp\\\\srv.js' ''"), { program: 'node', args: ['C:\\\\mcp\\\\srv.js', ''] });
  assert.equal(splitCommand('npx "sem fim'), undefined);
  assert.equal(commandText({ program: 'npx', args: ['-y', 'minha empresa'] }), 'npx -y "minha empresa"');
  assert.notEqual(commandApproval({ program: 'npx', args: ['a'] }, { X: '1' }), commandApproval({ program: 'npx', args: ['a'] }, { X: '2' }), 'o ambiente faz parte do que você aprovou');

  const db = new DatabaseSync(':memory:');
  migrate(db);
  const store = new McpServers(db);
  const secret = 'tok-do-programa-nao-vaza';
  const vault = { resolve: async <T>(x: T) => ({ value: JSON.parse(JSON.stringify(x).replaceAll('{{segredo:chamados/token}}', secret)) as T, used: [secret] }) };
  const work = mkdtempSync(join(tmpdir(), 'orbi-mcp-cmd-'));
  const hub = new McpHub(store, vault, work);
  process.env.ORBI_TESTE_PRIVADO = 'segredo-do-runtime';
  const command = { program: process.execPath, args: [join(import.meta.dirname, 'support', 'fake-mcp-stdio.mjs')] };
  const env = { CHAMADOS_TOKEN: '{{segredo:chamados/token}}' };
  try {
    store.add({ id: 'chamados', name: 'Chamados', transport: 'command', command, env });
    assert.equal(hub.state('chamados'), 'aprovar', 'nunca aprovado: espera você');
    await assert.rejects(hub.refresh('chamados'), /ainda não foi aprovado/);

    store.approve('chamados');
    await hub.refresh('chamados');
    assert.equal(hub.state('chamados'), 'conectado');
    assert.deepEqual(store.tools('chamados').map((t) => [t.name, t.effective]), [['abrir_chamado', 'escrita'], ['ver_ambiente', 'leitura']]);
    const seen = await hub.call('chamados', 'ver_ambiente', {});
    assert.match(seen, /token=\[redacted\]|token=\*+|token=(?!-)/, 'o programa recebeu a credencial');
    assert.equal(seen.includes(secret), false, 'e ela não volta na resposta');
    assert.match(seen, /vazou=nao/, 'o que não foi declarado não chega ao programa');
    assert.match(seen, new RegExp(`pasta=${work.replace(/[\\\\^$.*+?()[\\]{}|]/g, '\\\\$&')}.chamados`), 'roda na pasta dele');

    // The command changed: it stops and asks again.
    store.edit('chamados', { command: { ...command, args: [...command.args, '--outro'] } });
    assert.equal(hub.state('chamados'), 'aprovar');
    await assert.rejects(hub.refresh('chamados'), /mudou ou ainda não foi aprovado/);
  } finally {
    delete process.env.ORBI_TESTE_PRIVADO;
    await hub.closeAll();
  }
});
