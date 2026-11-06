/**
 * The whole agent on a custom LlmAdapter: the adapter sees Orbi's system prompt,
 * its tools and the tool results, and answers with plain objects. Nothing here
 * touches Anthropic.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'orbi-llm-'));
Object.assign(process.env, {
  ORBI_DATA_DIR: dataDir,
  ORBI_WORKSPACE: dataDir,
  CHROME_MCP_AUTOSTART: 'false',
  CHROME_MCP_PORT: '1',
  ORBI_LLM: 'roteiro',
  ORBI_LLM_MODEL: 'modelo-interno-1',
});
delete process.env.ANTHROPIC_API_KEY;

const { ADAPTERS, configureLlm } = await import('../src/llm/index.ts');
type ChatRequest = Parameters<import('../src/llm/types.ts').LlmAdapter['chat']>[0];

// A scripted adapter: what a corporate gateway adapter would do, minus the HTTP.
const seen: ChatRequest[] = [];
let script: Array<(req: ChatRequest) => Awaited<ReturnType<import('../src/llm/types.ts').LlmAdapter['chat']>> | AsyncIterable<unknown>> = [];
ADAPTERS.roteiro = () => ({
  name: 'roteiro',
  models: [{ id: 'modelo-interno-1', contextWindow: 64_000 }],
  chat(req) {
    seen.push(structuredClone(req));
    const next = script.shift();
    if (!next) throw new Error('roteiro acabou');
    return next(req) as never;
  },
});

const { init } = await import('@flue/runtime');
const { start } = await import('@flue/runtime/node');
const { Orbi } = await import('../src/agents/orbi.ts');
const { default: app } = await import('../src/app.ts'); // registers the adapter (configureLlm)
const { config } = (await import('../src/services.ts')).services();

let flue: { [Symbol.asyncDispose](): Promise<void> };
before(async () => {
  flue = (await start({ agents: [Orbi] })) as never;
});
after(async () => {
  await flue[Symbol.asyncDispose]();
});

test('o agente roda num adaptador próprio: prompt, ferramentas, chamada e resultado', async () => {
  assert.equal(config.model, 'orbi-llm/modelo-interno-1');
  assert.equal(config.codeFixer, false, 'Claude Code fica desligado fora da Anthropic');

  script = [
    () => ({ toolCalls: [{ id: 'c1', name: 'brain_query', arguments: { text: 'portal' } }] }),
    async function* () {
      yield { type: 'text', delta: 'Ainda não sei nada sobre ' };
      yield { type: 'text', delta: 'o portal.' };
      yield { type: 'done', stopReason: 'stop', usage: { inputTokens: 900, outputTokens: 12 } };
    },
  ];
  const orbi = init(Orbi, { id: 'chat:adaptador' });
  const reply = await orbi.read(await orbi.dispatch('O que você sabe do portal?'));
  assert.match(reply.text, /Ainda não sei nada sobre o portal\./);

  assert.equal(seen.length, 2, 'duas idas ao modelo: a chamada de ferramenta e a resposta');
  const [first, second] = seen;
  assert.equal(first.model, 'modelo-interno-1');
  assert.match(first.system, /Você é o Orbi/);
  const tools = first.tools.map((t) => t.name);
  for (const t of ['brain_query', 'brain_learn', 'run_command', 'ask_developer']) assert.ok(tools.includes(t), `ferramenta ${t} oferecida`);
  assert.ok(!tools.includes('claude_code_prepare_fix'), 'sem Claude Code fora da Anthropic');
  assert.equal(first.tools.find((t) => t.name === 'brain_query')!.parameters.type, 'object', 'parâmetros em JSON Schema');
  assert.equal(first.messages.at(-1)?.role, 'user');

  const toolResult = second.messages.find((m) => m.role === 'tool');
  assert.ok(toolResult && toolResult.role === 'tool');
  assert.equal(toolResult.toolCallId, 'c1');
  assert.equal(toolResult.name, 'brain_query');
  const call = second.messages.find((m) => m.role === 'assistant' && m.toolCalls?.length);
  assert.ok(call, 'a chamada anterior volta no histórico');
});

test('erro do adaptador vira erro da resposta, com o nome do adaptador', async () => {
  script = [() => Promise.reject(new Error('gateway fora do ar')) as never];
  const orbi = init(Orbi, { id: 'chat:adaptador-erro' });
  const receipt = await orbi.dispatch('oi');
  const err: any = await orbi.read(receipt).then(() => null, (e) => e);
  assert.ok(err, 'a resposta falha');
  assert.match(String(err.cause?.message), /\[roteiro\] gateway fora do ar/);
});

test('health mostra o provedor', async () => {
  const health = await (await app.request('/api/health')).json();
  assert.equal(health.llm, 'roteiro');
  assert.equal(health.llmReady, true);
  assert.equal(health.model, 'orbi-llm/modelo-interno-1');
});

test('ORBI_LLM=module:<arquivo> carrega um adaptador sem recompilar', async () => {
  const file = join(dataDir, 'meu-gateway.mjs');
  writeFileSync(
    file,
    `export default (settings) => ({
       name: 'meu-gateway',
       models: [{ id: settings.model ?? 'm1' }],
       async chat(req) { return { text: 'ok ' + req.model + ' ' + settings.env.ORBI_LLM_REGIAO }; },
     });`,
  );
  const active = await configureLlm({ ORBI_LLM: `module:${file}`, ORBI_LLM_MODEL: 'm2', ORBI_LLM_REGIAO: 'sa-east' }, dataDir);
  assert.equal(active.adapter?.name, 'meu-gateway');
  assert.equal(active.model, 'orbi-llm/m2');
  const answer = await active.adapter!.chat({ model: 'm2', system: '', messages: [], tools: [] }, new AbortController().signal);
  assert.deepEqual(answer, { text: 'ok m2 sa-east' });

  await assert.rejects(configureLlm({ ORBI_LLM: 'nao-existe' }), /desconhecido.*openai-compatible/);
  await assert.rejects(configureLlm({ ORBI_LLM: 'openai-compatible', ORBI_LLM_MODEL: 'x' }), /ORBI_LLM_BASE_URL/);
});

