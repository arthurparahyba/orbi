/**
 * ORBI_LLM=openai-compatible against a local mock of /v1/chat/completions:
 * the configuration path a corporate gateway would use, end to end.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Body = { model: string; max_tokens?: number; messages: any[]; tools?: any[] };
const received: Array<{ headers: IncomingMessage['headers']; body: Body }> = [];
const answers: unknown[] = [];
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    if (req.url !== '/v1/chat/completions') return res.writeHead(404).end();
    received.push({ headers: req.headers, body: JSON.parse(raw) });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answers.shift()));
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;

const dataDir = mkdtempSync(join(tmpdir(), 'orbi-oai-'));
Object.assign(process.env, {
  ORBI_DATA_DIR: dataDir,
  ORBI_WORKSPACE: dataDir,
  CHROME_MCP_AUTOSTART: 'false',
  CHROME_MCP_PORT: '1',
  ORBI_LLM: 'openai-compatible',
  ORBI_LLM_BASE_URL: `http://127.0.0.1:${port}/v1/`,
  ORBI_LLM_API_KEY: 'chave-do-gateway',
  ORBI_LLM_MODEL: 'llm-corporativo',
  ORBI_LLM_HEADERS: '{"x-tenant":"time-pagamentos"}',
  ORBI_LLM_MAX_TOKENS: '2048',
});
delete process.env.ANTHROPIC_API_KEY;

const { init } = await import('@flue/runtime');
const { start } = await import('@flue/runtime/node');
const { Orbi } = await import('../src/agents/orbi.ts');
await import('../src/app.ts');

let flue: { [Symbol.asyncDispose](): Promise<void> };
before(async () => {
  flue = (await start({ agents: [Orbi] })) as never;
});
after(async () => {
  await flue[Symbol.asyncDispose]();
  server.close();
});

test('gateway compatível com OpenAI: ferramentas, resultado e resposta', async () => {
  answers.push(
    {
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'brain_query', arguments: '{"text":"esteira"}' } }] } }],
      usage: { prompt_tokens: 1500, completion_tokens: 20 },
    },
    { choices: [{ finish_reason: 'stop', message: { content: 'Ainda não aprendi nada sobre a esteira.' } }], usage: { prompt_tokens: 1600, completion_tokens: 10 } },
  );
  const orbi = init(Orbi, { id: 'chat:gateway' });
  const reply = await orbi.read(await orbi.dispatch('O que você sabe da esteira?'));
  assert.match(reply.text, /Ainda não aprendi nada sobre a esteira/);

  assert.equal(received.length, 2);
  const [first, second] = received;
  assert.equal(first.headers.authorization, 'Bearer chave-do-gateway');
  assert.equal(first.headers['x-tenant'], 'time-pagamentos');
  assert.equal(first.body.model, 'llm-corporativo');
  assert.equal(first.body.max_tokens, 2048);
  assert.equal(first.body.messages[0].role, 'system');
  assert.match(first.body.messages[0].content, /Você é o Orbi/);
  assert.ok(first.body.tools?.some((t) => t.type === 'function' && t.function.name === 'brain_query' && t.function.parameters.type === 'object'));

  const assistant = second.body.messages.find((m) => m.role === 'assistant' && m.tool_calls);
  assert.equal(assistant.tool_calls[0].id, 'call_9');
  assert.equal(JSON.parse(assistant.tool_calls[0].function.arguments).text, 'esteira');
  const tool = second.body.messages.find((m) => m.role === 'tool');
  assert.equal(tool.tool_call_id, 'call_9');
});

test('erro HTTP do gateway chega com status e corpo', async () => {
  const fail = createServer((_req, res) => res.writeHead(503).end('manutenção programada'));
  await new Promise<void>((r) => fail.listen(0, '127.0.0.1', r));
  const { openAICompatible } = await import('../src/llm/adapters/openai-compatible.ts');
  const adapter = await openAICompatible({ baseUrl: `http://127.0.0.1:${(fail.address() as { port: number }).port}/v1`, model: 'x', env: {} });
  await assert.rejects(
    Promise.resolve(adapter.chat({ model: 'x', system: 's', messages: [{ role: 'user', content: 'oi' }], tools: [] }, new AbortController().signal)),
    /HTTP 503 .*manutenção programada/,
  );
  fail.close();
});
