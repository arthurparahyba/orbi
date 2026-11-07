import { Hono } from 'hono';
import type { OrbiServices } from '../../services.ts';
import { handleMcp } from '../../mcp/server.ts';
import { HttpError } from '../errors.ts';
import type { Agent } from './types.ts';

/** Only loopback names: a page on another site that resolves to 127.0.0.1 (DNS rebinding) is turned away. */
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

/**
 * POST /mcp — Orbi's MCP server (streamable HTTP, stateless). Each coding
 * agent authenticates with its own token (Authorization: Bearer orb_…),
 * created on the Agentes screen; the app's ORBI_API_TOKEN does not apply here.
 */
export function mcpRoutes(s: OrbiServices, agent: Agent) {
  return new Hono().all('/', async (c) => {
    if (!LOCAL_HOST.test(c.req.header('host') ?? new URL(c.req.url).host)) throw new HttpError(401, 'unauthorized', 'o MCP do Orbi só atende nesta máquina');
    const client = s.agents.clients.authenticate(c.req.header('authorization'));
    if (!client) throw new HttpError(401, 'unauthorized', 'token de agente ausente, inválido ou revogado: gere um na tela Agentes do Orbi');
    // Stateless and without server-initiated messages: no standing SSE stream (GET) and no sessions to end (DELETE).
    if (c.req.method !== 'POST') return c.body(null, 405, { allow: 'POST' });
    return handleMcp(c.req.raw, { s, agent, client });
  });
}
