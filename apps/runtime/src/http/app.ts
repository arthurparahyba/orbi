import { createAgentRouter } from '../agents/runtime-port.ts';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { OrbiServices } from '../services.ts';
import type { Background } from '../compose.ts';
import { HttpError, installErrorHandling } from './errors.ts';
import type { Agent } from './routes/types.ts';
import { conversationRoutes } from '../contexts/talk/index.ts';
import { inboxRoutes } from '../contexts/talk/index.ts';
import { recordingRoutes } from '../contexts/tools/index.ts';
import { vaultRoutes } from '../contexts/secrets/index.ts';
import { brainRoutes } from '../contexts/knowledge/index.ts';
import { autonomyRoutes } from '../contexts/trust/index.ts';
import { healthRoutes } from './routes/health.ts';
import { eventRoutes } from './routes/events.ts';
import { usageRoutes } from '../contexts/telemetry/index.ts';
import { agentRoutes } from './routes/agents.ts';
import { mcpRoutes } from './routes/mcp.ts';
import { transcribeRoutes } from '../contexts/talk/index.ts';
import { voiceRoutes } from '../contexts/talk/index.ts';
import { pipelineRoutes, pipelineRunRoutes } from '../contexts/procedures/index.ts';
import { codeAgentRoutes } from '../contexts/tools/index.ts';
import { followupRoutes } from '../contexts/talk/index.ts';
import { reviewNoteRoutes } from '../contexts/improvement/index.ts';
import { stepLearningRoutes } from '../contexts/procedures/index.ts';
import { diagnosisRoutes } from '../contexts/improvement/index.ts';
import { modelRoutes } from '../contexts/models/index.ts';
import { browserRoutes } from '../contexts/tools/index.ts';
import { mcpServerRoutes } from '../contexts/tools/index.ts';
import { stats, exportBrain } from '../overview.ts';

// The desktop app's webview (tauri://localhost, http://tauri.localhost) and local
// dev servers are the only origins allowed to call the runtime from a browser.
const LOCAL_ORIGIN = /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

/**
 * The local server the desktop app talks to. It binds to loopback; set
 * ORBI_API_TOKEN to also require a bearer token. Request bodies are validated
 * against @orbi/contracts and every error answers as ApiError.
 *
 *   /agents/orbi/:id   Flue conversation: POST a message, GET the event stream
 *   /agents/configurador/:id   the configuration chat (config:…), its own agent
 *   /api/...            one router per resource (routes/)
 *   /api/events         what changed, as server-sent events (the app refetches)
 *   /api/code-agents    coding agents of this machine and which does each task
 *   /api/model          the model: status, test, choose (first opening, Configurações › Modelo)
 *   /api/mcp-servers    MCP servers Orbi uses: test, add, change, remove, mark each tool
 *   /api/browser        Orbi's browser (Chrome DevTools): settings, applied with a restart
 *   /mcp                Orbi as an MCP server for coding agents (own token per agent)
 */
export function createHttpApp(s: OrbiServices, background: Background, agent: Agent, others: { configurador?: Agent } = {}): Hono {
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
    // /mcp authenticates each coding agent with its own token (routes/mcp.ts).
    if (c.req.method !== 'OPTIONS' && token && !/^\/mcp\/?$/.test(c.req.path) && c.req.header('authorization') !== `Bearer ${token}`) {
      throw new HttpError(401, 'unauthorized', 'token ausente ou inválido');
    }
    await next();
  });

  app.route('/agents/orbi', createAgentRouter(agent));
  // The configuration chat beside Configurações › Agentes de código (agents/configurador.ts).
  if (others.configurador) app.route('/agents/configurador', createAgentRouter(others.configurador));
  app.route('/api/conversations', conversationRoutes(s, agent));
  app.route('/api/inbox', inboxRoutes(s, agent));
  app.route('/api/recordings', recordingRoutes(s, agent));
  app.route('/api/vault', vaultRoutes(s));
  app.route('/api/brain', brainRoutes(s, { stats: () => stats(s), exportBrain: (dir) => exportBrain(s, dir) }));
  app.route('/api/autonomy', autonomyRoutes(s));
  app.route('/api/health', healthRoutes(s, background));
  app.route('/api/events', eventRoutes(s));
  app.route('/api/usage', usageRoutes(s));
  app.route('/api/agents', agentRoutes(s));
  app.route('/api/transcribe', transcribeRoutes(s));
  app.route('/api/voice', voiceRoutes(s));
  app.route('/api/pipelines', pipelineRoutes(s, agent));
  app.route('/api/pipeline-runs', pipelineRunRoutes(s, agent));
  app.route('/api/code-agents', codeAgentRoutes(s));
  app.route('/api/followups', followupRoutes(s));
  app.route('/api/review-notes', reviewNoteRoutes(s));
  app.route('/api/step-learnings', stepLearningRoutes(s));
  app.route('/api/diagnoses', diagnosisRoutes(s, agent));
  app.route('/api/model', modelRoutes(s));
  app.route('/api/browser', browserRoutes(s, background));
  app.route('/api/mcp-servers', mcpServerRoutes(s));
  app.route('/mcp', mcpRoutes(s, agent));
  return app;
}
