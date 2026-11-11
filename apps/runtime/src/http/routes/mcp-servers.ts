import { Hono } from 'hono';
import { AddMcpServer, EditMcpServer, SetMcpTool, TestMcpServer } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { headerProblems, serverIdFor, urlProblem } from '../../mcp-client/domain.ts';
import { log } from '../../observability/log.ts';
import { body, HttpError } from '../errors.ts';

type S = Pick<OrbiServices, 'mcpServers' | 'mcpHub' | 'vault' | 'policy'>;

/**
 * The MCP servers Orbi uses (Autonomia › Ferramentas MCP, docs/funcionalidades/20): test before
 * saving, add, change, turn off, remove, and mark each tool as leitura or escrita.
 */
export function mcpServerRoutes(s: S) {
  const check = (url: string | undefined, headers: Record<string, string> | undefined) => {
    const problems = [
      ...(url !== undefined ? [urlProblem(url)].filter((p): p is string => !!p) : []),
      ...(headers ? headerProblems(headers, (n) => s.vault.has(n)) : []),
    ];
    if (problems.length) throw new HttpError(400, 'invalid_mcp_server', problems.join(' '), problems.map((message) => ({ path: 'mcp', message })));
  };
  const detail = (id: string) => {
    const server = s.mcpServers.get(id);
    if (!server) throw new HttpError(404, 'not_found', `servidor MCP ${id} não existe`);
    return { ...s.mcpServers.summary(server, s.mcpHub.state(id)), tools: s.mcpServers.tools(id).map(({ inputSchema: _schema, ...t }) => t) };
  };
  const reconnect = (id: string) => s.mcpHub.refresh(id).catch((error) => log.warn('servidor MCP não conectou', { server: id, error: String(error) }));

  return new Hono()
    .get('/', (c) => c.json(s.mcpServers.list().map((x) => s.mcpServers.summary(x, s.mcpHub.state(x.id)))))
    .post('/test', async (c) => {
      const { url, headers } = await body(c, TestMcpServer);
      check(url, headers);
      return c.json(await s.mcpHub.test(url, headers));
    })
    .post('/', async (c) => {
      const input = await body(c, AddMcpServer);
      check(input.url, input.headers);
      const id = serverIdFor(input.name, s.mcpServers.list().map((x) => x.id));
      s.mcpServers.add({ id, name: input.name, url: input.url, headers: input.headers });
      // What you saw and marked in the form: every tool listed there counts as looked at.
      const marks = new Map(input.tools.map((t) => [t.name, { kind: t.kind, enabled: t.enabled }]));
      await s.mcpHub.refresh(id, marks).catch(() => {});
      return c.json(detail(id), 201);
    })
    .get('/:id', (c) => c.json(detail(c.req.param('id'))))
    .put('/:id', async (c) => {
      const id = c.req.param('id');
      detail(id);
      const input = await body(c, EditMcpServer);
      check(input.url, input.headers);
      s.mcpServers.edit(id, input);
      await reconnect(id);
      return c.json(detail(id));
    })
    .post('/:id/refresh', async (c) => {
      const id = c.req.param('id');
      detail(id);
      await reconnect(id);
      return c.json(detail(id));
    })
    .put('/:id/tools/:tool', async (c) => {
      const id = c.req.param('id');
      if (!s.mcpServers.setTool(id, c.req.param('tool'), await body(c, SetMcpTool))) throw new HttpError(404, 'not_found', 'ferramenta não existe');
      return c.json(detail(id));
    })
    .delete('/:id', async (c) => {
      const id = c.req.param('id');
      detail(id);
      await s.mcpHub.disconnect(id);
      s.mcpServers.remove(id);
      s.policy.forgetMcp(id);
      return c.json({ removed: id });
    });
}
