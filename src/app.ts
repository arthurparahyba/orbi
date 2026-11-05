import { dispatch } from '@flue/runtime';
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.ts';
import { Vigia } from './agents/vigia.ts';
import { brain, conversations, inbox, policy } from './runtime.ts';
import { startBridge, type RunningBridge } from './mcp/bridge.ts';
import type { AutonomyLevel, Category } from './policy/autonomy.ts';
import type { Autonomy } from './brain/store.ts';

/**
 * The local server the desktop app talks to. It binds to loopback (Vite/Node
 * default for this project); set VIGIA_API_TOKEN to also require a bearer token.
 *
 *   /agents/vigia/:id   Flue conversation: POST a message, GET the event stream
 *   /api/...            brain, inbox (approvals + questions), autonomy, health
 */
const app = new Hono();

// The desktop app's webview (tauri://localhost, http://tauri.localhost) and local
// dev servers are the only origins allowed to call the runtime from a browser.
const LOCAL_ORIGIN = /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
app.use(
  '*',
  cors({
    origin: (origin) => (LOCAL_ORIGIN.test(origin) ? origin : null),
    allowHeaders: ['content-type', 'authorization', 'idempotency-key', 'stream-offset', 'stream-cursor'],
    exposeHeaders: ['stream-next-offset', 'stream-cursor', 'stream-up-to-date', 'stream-closed', 'location', 'etag'],
    credentials: true,
  }),
);

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const token = process.env.VIGIA_API_TOKEN;
  if (token && c.req.header('authorization') !== `Bearer ${token}`) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

app.route('/agents/vigia', createAgentRouter(Vigia));

// ── conversations ──────────────────────────────────────────────────────────
/** Sidebar list. The app opens /agents/vigia/<id> for each one. */
app.get('/api/conversations', (c) => c.json(conversations.list()));
app.post('/api/conversations', async (c) => {
  const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string });
  return c.json(conversations.create(body.title), 201);
});
app.patch('/api/conversations/:id', async (c) => {
  const { title } = await c.req.json<{ title?: string }>();
  const item = conversations.touch(c.req.param('id'), title);
  return item ? c.json(item) : c.json({ error: 'não encontrada' }, 404);
});

// ── inbox: what waits for the developer ────────────────────────────────────
app.get('/api/inbox', (c) => c.json(inbox.list({ status: (c.req.query('status') as never) ?? 'open' })));

app.post('/api/inbox/:id/decision', async (c) => {
  const { decision, approver = 'Desenvolvedor' } = await c.req.json<{ decision: 'approve' | 'deny'; approver?: string }>();
  const item = inbox.get(c.req.param('id'));
  if (!item || !item.approvalId) return c.json({ error: 'item não encontrado ou não é aprovação' }, 404);
  inbox.resolve(item.id, decision === 'approve' ? 'approved' : 'denied');
  const receipt = await dispatch(Vigia, {
    id: item.conversationId,
    message: {
      kind: 'signal',
      type: 'tool-approval',
      body: `${approver} ${decision === 'approve' ? 'aprovou' : 'negou'}: ${item.title}`,
      attributes: { approvalId: item.approvalId, decision, approver },
    },
  });
  return c.json(receipt, 202);
});

app.post('/api/inbox/:id/answer', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const item = inbox.get(c.req.param('id'));
  if (!item || item.kind !== 'question') return c.json({ error: 'pergunta não encontrada' }, 404);
  inbox.resolve(item.id, 'answered');
  const receipt = await dispatch(Vigia, { id: item.conversationId, message: { kind: 'user', body: text } });
  return c.json(receipt, 202);
});

// ── brain: the Cérebro screen ──────────────────────────────────────────────
app.get('/api/brain', (c) => c.json({ stats: brain.stats(), gaps: brain.gaps(), ...brain.graph() }));
app.get('/api/brain/entities/:id', (c) => {
  const entity = brain.get(c.req.param('id'));
  if (!entity) return c.json({ error: 'não encontrado' }, 404);
  return c.json({ entity, relations: brain.neighbors(entity.id), nearby: brain.reachable(entity.id, 2) });
});
app.get('/api/brain/search', (c) => c.json(brain.search(c.req.query('q') ?? '')));
app.get('/api/brain/playbooks', (c) => c.json(brain.playbooks()));
app.patch('/api/brain/playbooks/:name', async (c) => {
  const { autonomy } = await c.req.json<{ autonomy: Autonomy }>();
  return c.json(brain.setPlaybookAutonomy(c.req.param('name'), autonomy));
});
app.get('/api/brain/runs', (c) => c.json(brain.runs()));
app.post('/api/brain/export', (c) => c.json({ written: brain.exportMarkdown(config.brainExportDir), dir: config.brainExportDir }));

// ── autonomy: the Rotinas screen ───────────────────────────────────────────
app.get('/api/autonomy', (c) => c.json(policy.get()));
app.patch('/api/autonomy', async (c) => {
  const { category, level } = await c.req.json<{ category: Category; level: AutonomyLevel }>();
  return c.json(policy.set(category, level));
});

// ── browser bridge ─────────────────────────────────────────────────────────
let bridge: RunningBridge | undefined;
let bridgeError: string | undefined;

app.get('/api/health', (c) =>
  c.json({
    model: config.model,
    codeModel: config.codeModel,
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    chrome: bridge ? { url: bridge.url, tools: bridge.toolNames.length } : { error: bridgeError ?? 'desligado' },
    brain: brain.stats(),
  }),
);

if (config.chrome.autostart) {
  startBridge({
    port: config.chrome.port,
    token: config.chrome.token,
    chrome: { browserUrl: config.chrome.browserUrl, headless: config.chrome.headless },
  })
    .then((b) => {
      bridge = b;
      console.log(`[vigia] Chrome DevTools MCP em ${b.url} (${b.toolNames.length} tools)`);
    })
    .catch((error) => {
      bridgeError = error instanceof Error ? error.message : String(error);
      console.error('[vigia] bridge do Chrome não subiu:', bridgeError);
    });
}

// ── follow-ups: Vigia wakes itself up ──────────────────────────────────────
const followupTimer = setInterval(async () => {
  for (const f of brain.claimDueFollowups()) {
    try {
      await dispatch(Vigia, {
        id: f.conversationId,
        message: { kind: 'signal', type: 'followup', body: `Retorno agendado: ${f.note}`, attributes: { followupId: f.id } },
      });
    } catch (error) {
      console.error('[vigia] follow-up falhou:', error);
    }
  }
}, 15_000);
followupTimer.unref();

export default app;

// Started by the desktop shell: exit when the window process is gone, even if it
// was killed without a chance to stop us (SIGKILL, crash, force-quit).
const parentPid = Number(process.env.VIGIA_PARENT_PID);
if (parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      console.log('[vigia] app desktop encerrado; parando o runtime');
      process.exit(0);
    }
  }, 2_000).unref();
}
