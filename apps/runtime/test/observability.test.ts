/**
 * Observability: structured log lines, usage summed from Flue's events per
 * conversation and day, and the report the Autonomia screen shows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FlueObservation } from '../src/agents/runtime-port.ts';
import { createLogger, formatLine, type Level } from '../src/observability/log.ts';
import { handleObservation } from '../src/observability/telemetry.ts';
import { loadConfig } from '../src/config.ts';
import { createOrbi } from '../src/compose.ts';
import { createHttpApp } from '../src/http/app.ts';
import { Orbi } from '../src/agents/orbi.ts';

function memoryLogger(level: Level = 'debug') {
  const lines: Array<{ level: Level; line: string }> = [];
  const logger = createLogger({ format: 'json', level, write: (line, lvl) => lines.push({ level: lvl, line }) });
  return { logger, lines, parsed: () => lines.map((l) => JSON.parse(l.line)) };
}

async function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-obs-'));
  return createOrbi(loadConfig({ ORBI_VAULT: 'file', CHROME_MCP_AUTOSTART: 'false' }, cwd), {}, {});
}

const turn = (conversationId: string, extra: Partial<Record<string, unknown>> = {}) =>
  ({
    type: 'turn', instanceId: conversationId, conversationId: 'conv_interno', turnId: 't', purpose: 'agent', durationMs: 800, isError: false,
    request: { providerId: 'anthropic', providerName: 'anthropic', requestedModel: 'claude-haiku-5-5', api: 'anthropic-messages' },
    response: {
      usage: { input: 1200, output: 300, cacheRead: 1000, cacheWrite: 0, totalTokens: 2500, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.0042 } },
    },
    ...extra,
  }) as unknown as FlueObservation;

const tool = (conversationId: string, isError = false) =>
  ({ type: 'tool', instanceId: conversationId, conversationId: 'conv_interno', toolName: 'run_command', toolCallId: 'c', isError, durationMs: 120, result: isError ? { content: [{ type: 'text', text: 'gh: não encontrado' }] } : {} }) as unknown as FlueObservation;

test('log: json com atributos, pretty legível, nível mínimo e with()', () => {
  const { logger, lines, parsed } = memoryLogger('info');
  logger.debug('não aparece');
  logger.with({ conversation: 'chat:1' }).info('turno do modelo', { ms: 812, vazio: undefined });
  logger.error('falhou', { error: new Error('boom') });
  assert.equal(lines.length, 2);
  const [info, error] = parsed();
  assert.equal(info.msg, 'turno do modelo');
  assert.equal(info.conversation, 'chat:1');
  assert.equal(info.ms, 812);
  assert.ok(!('vazio' in info));
  assert.equal(error.error.message, 'boom');
  assert.equal(lines[1].level, 'error');

  const pretty = formatLine('pretty', 'info', 'turno do modelo', { conversation: 'chat:1', note: 'com espaço' }, new Date('2026-11-06T14:31:02Z'));
  assert.match(pretty, /INFO {2}turno do modelo {2}conversation=chat:1 note="com espaço"$/);
});

test('telemetria: turnos e ferramentas viram uso por conversa, e logs', async () => {
  const orbi = await setup();
  const { logger, parsed } = memoryLogger();
  const deps = { usage: orbi.usage, log: logger };
  const conv = orbi.conversations.create('Deploy do portal');
  handleObservation(turn(conv.id), deps);
  handleObservation(turn(conv.id, { isError: true, response: { error: { message: 'overloaded' } } }), deps);
  handleObservation(tool(conv.id), deps);
  handleObservation(tool(conv.id, true), deps);
  handleObservation(turn('chat:outra'), deps);
  handleObservation({ type: 'submission_settled', submissionId: 's1', outcome: 'failed', agentName: 'orbi', error: { message: 'sem chave' } } as unknown as FlueObservation, deps);

  const report = orbi.usage.report(30);
  assert.equal(report.period.turns, 3);
  assert.equal(report.today.turns, 3);
  assert.equal(report.period.failedTurns, 1);
  assert.equal(report.period.tokensIn, 2400);
  assert.ok(Math.abs(report.period.costUsd - 0.0084) < 1e-9);
  const mine = report.conversations.find((c) => c.conversationId === conv.id)!;
  assert.equal(mine.title, 'Deploy do portal');
  assert.equal(mine.model, 'anthropic/claude-haiku-5-5');
  assert.deepEqual([mine.turns, mine.toolCalls, mine.failedTools, mine.modelMs], [2, 2, 1, 1600]);
  assert.equal(report.conversations.find((c) => c.conversationId === 'chat:outra')!.title, 'chat:outra');

  const lines = parsed();
  assert.ok(lines.some((l) => l.msg === 'turno do modelo' && l.conversation === conv.id && l.costUsd === 0.0042));
  assert.ok(lines.some((l) => l.msg === 'turno do modelo falhou' && l.error === 'overloaded'));
  assert.ok(lines.some((l) => l.msg === 'ferramenta falhou' && l.tool === 'run_command' && l.error === 'gh: não encontrado'));
  assert.ok(lines.some((l) => l.level === 'error' && l.msg === 'execução falhou' && l.error === 'sem chave'));
});

test('GET /api/usage: relatório, validação de days e evento usage', async () => {
  const orbi = await setup();
  const seen: string[] = [];
  orbi.events.subscribe((e) => seen.push(`${e.topic}:${e.id ?? ''}`));
  orbi.usage.recordTurn({ conversationId: 'chat:1', model: 'x/y', durationMs: 10, failed: false, tokensIn: 5 });
  orbi.usage.recordTurn({ conversationId: 'chat:1', model: 'x/y', durationMs: 10, failed: false, at: new Date(Date.now() - 40 * 86_400_000) });
  await new Promise((r) => setImmediate(r));
  assert.ok(seen.includes('usage:chat:1'));

  const app = createHttpApp(orbi, { bridge: () => undefined, bridgeError: () => 'desligado', stop: async () => {} }, Orbi);
  const r30 = await (await app.request('/api/usage')).json();
  assert.equal(r30.days, 30);
  assert.equal(r30.period.turns, 1, 'o turno de 40 dias atrás fica de fora');
  const r60 = await (await app.request('/api/usage?days=60')).json();
  assert.equal(r60.period.turns, 2);
  assert.equal((await app.request('/api/usage?days=0')).status, 400);
  assert.equal((await app.request('/api/usage?days=abc')).status, 400);
});
