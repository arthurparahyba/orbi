import { dispatch } from '@flue/runtime';
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { resolve } from 'node:path';
import { binaryStatus } from '../tools/exec.ts';
import { demonstrationMessage } from '../browser/recorder.ts';
import { describePlugins } from '../llm/index.ts';
import type { AutonomyLevel, Category } from '../policy/autonomy.ts';
import type { Autonomy } from '../brain/store.ts';
import type { OrbiServices } from '../services.ts';
import type { Background } from '../compose.ts';

type Agent = Parameters<typeof createAgentRouter>[0] & Parameters<typeof dispatch>[0];

/**
 * The local server the desktop app talks to. It binds to loopback; set
 * ORBI_API_TOKEN to also require a bearer token.
 *
 *   /agents/orbi/:id   Flue conversation: POST a message, GET the event stream
 *   /api/...            brain, inbox (approvals + questions), autonomy, health
 */
export function createHttpApp(s: OrbiServices, background: Background, Orbi: Agent): Hono {
  const { brain, conversations, inbox, policy, vault, recorder, config } = s;
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
    const token = config.apiToken;
    if (token && c.req.header('authorization') !== `Bearer ${token}`) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });

  app.route('/agents/orbi', createAgentRouter(Orbi));

  // ── conversations ──────────────────────────────────────────────────────────
  /** Sidebar list. The app opens /agents/orbi/<id> for each one. */
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
    const receipt = await dispatch(Orbi, {
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
    const receipt = await dispatch(Orbi, { id: item.conversationId, message: { kind: 'user', body: text } });
    return c.json(receipt, 202);
  });

  // ── demonstrations: the developer teaches by doing (and narrating) ────────
  app.post('/api/recordings', async (c) => {
    const body = await c.req.json<{ conversationId: string; url?: string; narrated?: boolean }>();
    if (!body.conversationId) return c.json({ error: 'conversationId obrigatório' }, 400);
    try {
      const rec = await recorder.start(body.conversationId, { url: body.url || undefined, narrated: body.narrated });
      const conv = conversations.list().find((x) => x.id === body.conversationId);
      if (conv?.title === 'Nova conversa') conversations.touch(conv.id, 'Demonstração no navegador');
      return c.json(rec, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
  });
  app.get('/api/recordings/active', (c) => c.json(recorder.active() ?? null));
  app.get('/api/recordings/:id', (c) => {
    const rec = recorder.get(c.req.param('id'));
    return rec ? c.json(rec) : c.json({ error: 'gravação não encontrada' }, 404);
  });
  app.post('/api/recordings/:id/audio', async (c) => {
    const startedAt = Number(c.req.query('startedAt'));
    const durationMs = Number(c.req.query('durationMs') ?? '0');
    const wav = Buffer.from(await c.req.arrayBuffer());
    if (!startedAt || wav.length < 44) return c.json({ error: 'envie audio/wav com ?startedAt=<epoch ms>' }, 400);
    if (wav.length > 8 * 1024 * 1024) return c.json({ error: 'segmento grande demais' }, 413);
    try {
      return c.json(recorder.addAudio(c.req.param('id'), startedAt, durationMs, wav), 202);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
    }
  });
  app.post('/api/recordings/:id/stop', async (c) => {
    const { discard = false } = await c.req.json<{ discard?: boolean }>().catch(() => ({ discard: false }));
    const rec = recorder.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'gravação não encontrada' }, 404);
    // Transcription may still be running: answer now, hand the timeline to the agent when it is ready.
    void recorder.stop(rec.id, discard).then(async (done) => {
      if (discard || done.actions.length === 0 && !done.narration.some((n) => n.text)) return;
      await dispatch(Orbi, { id: done.conversationId, message: { kind: 'user', body: demonstrationMessage(done) } });
    }).catch((error) => console.error('[orbi] finalizar demonstração falhou:', error));
    return c.json({ ...rec, status: discard ? 'discarded' : 'transcribing' }, 202);
  });

  // ── vault: credentials, never in the brain ─────────────────────────────────
  app.get('/api/vault', async (c) => c.json({ backend: await vault.backend(), secrets: vault.list() }));
  app.put('/api/vault/:name{.+}', async (c) => {
    const { value, description } = await c.req.json<{ value: string; description?: string }>();
    if (!value) return c.json({ error: 'value obrigatório' }, 400);
    return c.json(await vault.set(c.req.param('name'), value, { description }));
  });
  app.delete('/api/vault/:name{.+}', async (c) => c.json({ deleted: await vault.delete(c.req.param('name')) }));

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

    let vaultBackend = 'desconhecido';
    void vault.backend().then((b) => { vaultBackend = b; }, () => {});

  app.get('/api/health', (c) =>
    c.json({
      model: config.model,
      codeModel: config.codeModel,
      llm: s.llm.adapter ? s.llm.adapter.name : 'anthropic',
      llmReady: s.llm.adapter ? true : Boolean(process.env.ANTHROPIC_API_KEY),
      codeFixer: config.codeFixer,
      plugins: describePlugins(s.llm.plugins),
      anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      envFile: resolve(config.cwd, '.env'),
      dataDir: config.dataDir,
      chrome: (() => {
        const bridge = background.bridge();
        return bridge ? { url: bridge.url, tools: bridge.toolNames.length } : { error: background.bridgeError() ?? 'iniciando' };
      })(),
      brain: brain.stats(),
      vault: vaultBackend,
      demoPortal: process.env.ORBI_DEMO_PORTAL,
      workspace: config.workspace,
      binaries: binaryStatus(config.allowedBinaries),
      stt: s.stt.name(),
    }),
  );

  return app;
}
