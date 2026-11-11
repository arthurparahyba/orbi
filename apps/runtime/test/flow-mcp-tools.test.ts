import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, inbox, components } from './support/flow.ts';
import { startFakeMcp } from './support/fake-mcp.ts';

/**
 * A server added on Configurações › Ferramentas MCP (docs/funcionalidades/20, fase 3), end to end with
 * the real Flue and a scripted model: its reads run alone, its writes become an approval card,
 * the tool that deletes stays off, and the token never reaches the model, the conversation or the log.
 */
const TOKEN = 'tok-mcp-nao-pode-vazar';
const fake = await startFakeMcp(TOKEN);
after(() => fake.close());
const { vault, mcpServers } = (await import('../src/services.ts')).services();
// The log goes to stdout/stderr: everything written during the test is kept to look for the token.
const written: string[] = [];
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = ((chunk: unknown, ...rest: unknown[]) => { written.push(String(chunk)); return (write as (...a: unknown[]) => boolean)(chunk, ...rest); }) as typeof stream.write;
}
const json = (method: string, body?: unknown) => ({ method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('servidor MCP: leitura roda sozinha, escrita vira cartão, apagar fica de fora, o token não vaza', async () => {
  // The form: a token typed in the header is refused; the vault reference is accepted.
  const plain = await app.request('/api/mcp-servers/test', json('POST', { url: fake.url, headers: { Authorization: `Bearer ${TOKEN}` } }));
  assert.equal(plain.status, 400);
  await vault.set('issues/token', TOKEN);
  const headers = { Authorization: 'Bearer {{segredo:issues/token}}' };
  const tested = (await (await app.request('/api/mcp-servers/test', json('POST', { url: fake.url, headers }))).json()) as any;
  assert.equal(tested.ok, true);
  const tools = tested.tools.map((t: any) => ({ name: t.name, kind: null, enabled: t.effective !== 'apaga' }));
  const saved = await app.request('/api/mcp-servers', json('POST', { name: 'Issues', url: fake.url, headers, tools }));
  assert.equal(saved.status, 201);
  const server = (await saved.json()) as any;
  assert.equal(server.id, 'issues');
  assert.equal(server.state, 'conectado');
  assert.deepEqual(server.counts, { leitura: 1, escrita: 2, novas: 0 });
  const rules = (await (await app.request('/api/autonomy')).json()) as any;
  assert.equal(rules.categories['mcp:issues:leitura'], 'auto');
  assert.equal(rules.categories['mcp:issues:escrita'], 'ask');

  // Reading: runs alone; the answer reaches the model without the token.
  faux.setResponses([
    (context) => {
      assert.equal(JSON.stringify(context).includes(TOKEN), false);
      return fauxAssistantMessage(fauxToolCall('issues__buscar_issue', { texto: 'homologação' }), { stopReason: 'toolUse' });
    },
    (context) => {
      const prompt = JSON.stringify(context);
      assert.match(prompt, /achei PAG-12/);
      assert.equal(prompt.includes(TOKEN), false, 'o token não chega ao modelo');
      return fauxAssistantMessage(fauxToolCall('issues__criar_issue', { projeto: 'PAG', titulo: 'Homologação falha com 502' }), { stopReason: 'toolUse' });
    },
  ]);
  const id = 'chat:teste-mcp';
  const orbi = init(Orbi, { id });
  const first = await orbi.read(await orbi.dispatch('abre um chamado da falha de homologação'));
  assert.deepEqual(fake.calls.map((c) => c.tool), ['buscar_issue'], 'só a leitura rodou');
  const card = components(first).find((c: any) => c.component === 'approval') as any;
  assert.equal(card?.title, 'Issues · criar_issue');
  assert.equal(card?.category, 'mcp:issues:escrita');
  assert.equal(card?.effect, 'publica');

  // Approved: it runs on the server.
  const item = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  faux.setResponses([fauxAssistantMessage(fauxText('Chamado PAG-13 criado.'))]);
  const res = await app.request(`/api/inbox/${item.id}/decision`, json('POST', { decision: 'approve' }));
  await orbi.read(await res.json());
  assert.deepEqual(fake.calls.map((c) => c.tool), ['buscar_issue', 'criar_issue']);
  assert.deepEqual(fake.calls[1]!.args, { projeto: 'PAG', titulo: 'Homologação falha com 502' });

  // The token is nowhere: not in the conversation's history, not in the log, not in the list.
  const conversation = JSON.stringify(await (await app.request(`/api/conversations/${encodeURIComponent(id)}/notebook`)).json());
  assert.equal(conversation.includes(TOKEN), false);
  const list = JSON.stringify(await (await app.request('/api/mcp-servers')).json());
  assert.equal(list.includes(TOKEN), false);
  assert.match(list, /\{\{segredo:issues\/token\}\}/);
  assert.equal(written.join('').includes(TOKEN), false, 'nem no log');
  assert.equal(mcpServers.tools('issues').find((t) => t.name === 'apagar_issue')?.enabled, false, 'a que apaga ficou desligada');

  // "Sempre sozinho para criar_issue", from the card: the next call runs without asking.
  assert.deepEqual(card.alwaysAlone, { server: 'issues', tool: 'criar_issue' });
  const alone = await app.request('/api/mcp-servers/issues/tools/criar_issue', json('PUT', { alone: true }));
  assert.equal(((await alone.json()) as any).tools.find((t: any) => t.name === 'criar_issue').alone, true);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('issues__criar_issue', { projeto: 'PAG', titulo: 'Outra falha' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Criei.')),
  ]);
  const second = await orbi.read(await orbi.dispatch('abre outro chamado'));
  assert.equal(components(second).some((c: any) => c.component === 'approval'), false, 'rodou sem cartão');
  assert.equal(fake.calls.at(-1)!.tool, 'criar_issue');

  // The tool that deletes: turned on, it still asks, and "sempre sozinho" never sticks to it nor is offered.
  await app.request('/api/mcp-servers/issues/tools/apagar_issue', json('PUT', { enabled: true, alone: true }));
  assert.equal(mcpServers.tools('issues').find((t) => t.name === 'apagar_issue')!.alone, false);
  faux.setResponses([fauxAssistantMessage(fauxToolCall('issues__apagar_issue', { id: 'PAG-13' }), { stopReason: 'toolUse' })]);
  const third = await orbi.read(await orbi.dispatch('apaga o PAG-13'));
  const del = components(third).find((c: any) => c.component === 'approval') as any;
  assert.equal(del?.effect, 'apaga');
  assert.equal(del?.alwaysAlone, undefined, 'apagar nunca oferece "sempre sozinho"');
  assert.equal(fake.calls.at(-1)!.tool, 'criar_issue', 'não apagou nada');

  // Removed: the server and its two rules go.
  assert.equal((await app.request('/api/mcp-servers/issues', json('DELETE'))).status, 200);
  const after = (await (await app.request('/api/autonomy')).json()) as any;
  assert.equal('mcp:issues:escrita' in after.categories, false);
});
