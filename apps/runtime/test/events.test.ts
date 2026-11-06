/**
 * Change events: any write to the database, the vault or a recording reaches
 * GET /api/events, coalesced per tick, with the item id where there is one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { createOrbi } from '../src/compose.ts';
import { createHttpApp } from '../src/http/app.ts';
import { createEvents, type ChangeEvent } from '../src/events.ts';
import { Orbi } from '../src/agents/orbi.ts';

const background = { bridge: () => undefined, bridgeError: () => 'desligado', stop: async () => {} };
const tick = () => new Promise((r) => setImmediate(r));

async function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-events-'));
  const orbi = await createOrbi(loadConfig({ ORBI_VAULT: 'file', CHROME_MCP_AUTOSTART: 'false' }, cwd), {}, {});
  const seen: ChangeEvent[] = [];
  orbi.events.subscribe((e) => seen.push(e));
  return { orbi, seen };
}

test('o barramento junta mudanças repetidas do mesmo tick', async () => {
  const events = createEvents();
  const seen: ChangeEvent[] = [];
  events.subscribe((e) => seen.push(e));
  events.emit('brain');
  events.emit('brain');
  events.emit('inbox', 'a');
  events.emit('inbox', 'b');
  await tick();
  assert.deepEqual(seen, [{ topic: 'brain' }, { topic: 'inbox', id: 'a' }, { topic: 'inbox', id: 'b' }]);
});

test('escritas no banco viram eventos, sem as lojas saberem', async () => {
  const { orbi, seen } = await setup();
  const item = orbi.inbox.add({ kind: 'question', conversationId: 'chat:1', title: 'Qual branch?', detail: '' });
  const conv = orbi.conversations.create();
  orbi.policy.set('comandos-escrita', 'auto');
  orbi.brain.upsertEntity({ id: 'portal', type: 'Ferramenta', props: {}, body: '' });
  await tick();
  assert.deepEqual(
    seen.map((e) => e.topic + (e.id ? `:${e.id}` : '')).sort(),
    ['autonomy', 'brain', `conversations:${conv.id}`, `inbox:${item.id}`].sort(),
  );

  seen.length = 0;
  orbi.inbox.resolve(item.id, 'answered');
  await orbi.vault.set('portal/senha', 'x');
  await tick();
  assert.deepEqual(seen, [{ topic: 'inbox', id: item.id }, { topic: 'vault' }]);
});

test('GET /api/events abre com hello e manda cada mudança', async () => {
  const { orbi } = await setup();
  const app = createHttpApp(orbi, background, Orbi);
  const abort = new AbortController();
  const res = await app.request('/api/events', { signal: abort.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  const until = async (pattern: RegExp) => {
    while (!pattern.test(text)) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`stream fechou antes de ${pattern}: ${text}`);
      text += value;
    }
  };
  try {
    await until(/event: hello/);
    const conv = orbi.conversations.create('Deploy');
    await until(new RegExp(`event: change\ndata: \\{"topic":"conversations","id":"${conv.id}"\\}`));
  } finally {
    abort.abort();
    await reader.cancel().catch(() => {});
  }
});
