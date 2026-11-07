import { Hono } from 'hono';
import { AcceptSuggestion, CreateAgentClient, EditAgentClient, SuggestionStatusQuery } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, body, notFound, query } from '../errors.ts';

/**
 * The Agentes screen: coding agents connected over MCP, the tasks they
 * delegated and the procedures they suggested. Accepting a suggestion is the
 * developer's decision, so it happens here and never through MCP.
 */
export function agentRoutes({ agents, brain }: OrbiServices) {
  const decide = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : String(error);
      if (code === 'not_found') throw new HttpError(404, 'not_found', message);
      if (code === 'conflict' || /já existe/.test(message)) throw new HttpError(409, 'conflict', message);
      throw new HttpError(400, 'invalid_body', message);
    }
  };

  return new Hono()
    .get('/clients', (c) => c.json(agents.clients.list()))
    .post('/clients', async (c) => {
      const { name } = await body(c, CreateAgentClient);
      return c.json(agents.clients.create(name), 201);
    })
    .patch('/clients/:id', async (c) => {
      const change = await body(c, EditAgentClient);
      const client = agents.clients.setPermissions(c.req.param('id'), change);
      if (!client) throw notFound('agente');
      return c.json(client);
    })
    .delete('/clients/:id', (c) => {
      const client = agents.clients.revoke(c.req.param('id'));
      if (!client) throw notFound('agente');
      return c.json(client);
    })
    .get('/requests', (c) => c.json(agents.requests.list()))
    .get('/suggestions', (c) => {
      const status = query(c, 'status', SuggestionStatusQuery);
      return c.json(agents.suggestions.list(status === '' ? {} : { status: status ?? 'open' }));
    })
    .post('/suggestions/:id/accept', async (c) => {
      const { variationOf } = await body(c, AcceptSuggestion);
      return c.json(decide(() => agents.suggestions.accept(c.req.param('id'), brain, { variationOf })));
    })
    .post('/suggestions/:id/reject', (c) => c.json(decide(() => agents.suggestions.reject(c.req.param('id')))));
}
