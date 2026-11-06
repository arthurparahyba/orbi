import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { OrbiServices } from '../services.ts';
import type { Background } from '../compose.ts';
import { HttpError, installErrorHandling } from './errors.ts';
import type { Agent } from './routes/types.ts';
import { conversationRoutes } from './routes/conversations.ts';
import { inboxRoutes } from './routes/inbox.ts';
import { recordingRoutes } from './routes/recordings.ts';
import { vaultRoutes } from './routes/vault.ts';
import { brainRoutes } from './routes/brain.ts';
import { autonomyRoutes } from './routes/autonomy.ts';
import { healthRoutes } from './routes/health.ts';
import { eventRoutes } from './routes/events.ts';
import { usageRoutes } from './routes/usage.ts';

// The desktop app's webview (tauri://localhost, http://tauri.localhost) and local
// dev servers are the only origins allowed to call the runtime from a browser.
const LOCAL_ORIGIN = /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

/**
 * The local server the desktop app talks to. It binds to loopback; set
 * ORBI_API_TOKEN to also require a bearer token. Request bodies are validated
 * against @orbi/contracts and every error answers as ApiError.
 *
 *   /agents/orbi/:id   Flue conversation: POST a message, GET the event stream
 *   /api/...            one router per resource (routes/)
 *   /api/events         what changed, as server-sent events (the app refetches)
 */
export function createHttpApp(s: OrbiServices, background: Background, agent: Agent): Hono {
  const app = new Hono();
  installErrorHandling(app);

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
    const token = s.config.apiToken;
    if (c.req.method !== 'OPTIONS' && token && c.req.header('authorization') !== `Bearer ${token}`) {
      throw new HttpError(401, 'unauthorized', 'token ausente ou inválido');
    }
    await next();
  });

  app.route('/agents/orbi', createAgentRouter(agent));
  app.route('/api/conversations', conversationRoutes(s));
  app.route('/api/inbox', inboxRoutes(s, agent));
  app.route('/api/recordings', recordingRoutes(s, agent));
  app.route('/api/vault', vaultRoutes(s));
  app.route('/api/brain', brainRoutes(s));
  app.route('/api/autonomy', autonomyRoutes(s));
  app.route('/api/health', healthRoutes(s, background));
  app.route('/api/events', eventRoutes(s));
  app.route('/api/usage', usageRoutes(s));
  return app;
}
