import { Hono } from 'hono';
import { AddMcpServer, EditMcpServer, SetMcpTool, TestMcpServer } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { envProblems, headerProblems, serverIdFor, urlProblem, type McpCommand } from '../../mcp-client/domain.ts';
import type { McpTarget } from '../../mcp-client/hub.ts';
import { log } from '../../observability/log.ts';
import { body, HttpError } from '../errors.ts';

type S = Pick<OrbiServices, 'mcpServers' | 'mcpHub' | 'vault' | 'policy'>;
type Input = { transport?: 'http' | 'command'; url?: string; headers?: Record<string, string>; command?: McpCommand; env?: Record<string, string>; approve?: boolean };

/**
 * The MCP servers Orbi uses (Configurações › Ferramentas MCP, docs/funcionalidades/20): test before
 * saving, add, change, approve a command, turn off, remove, and mark each tool.
 * A program (transport command) only runs after the developer confirms it in the app: `approve`
 * when testing or adding, or POST /:id/approve after the command changed.
 */
export function mcpServerRoutes(s: S) {
  const exists = (n: string) => s.vault.has(n);
  const fail = (problems: string[]) => {
    if (problems.length) throw new HttpError(400, 'invalid_mcp_server', problems.join(' '), problems.map((message) => ({ path: 'mcp', message })));
  };
  /** The whole target, checked: an address with headers, or a program with its environment. */
  const target = (i: Input): McpTarget => {
    if (i.transport === 'command') {
      fail([...(i.command ? [] : ['Informe o comando.']), ...envProblems(i.env ?? {}, exists)]);
      return { transport: 'command', command: i.command!, env: i.env ?? {} };
    }
    fail([...(i.url ? [urlProblem(i.url)].filter((p): p is string => !!p) : ['Informe o endereço.']), ...headerProblems(i.headers ?? {}, exists)]);
    return { transport: 'http', url: i.url!, headers: i.headers ?? {} };
  };
  const mustApprove = (i: Input) => {
    if (i.transport === 'command' && !i.approve) throw new HttpError(409, 'command_not_approved', 'Confirme que este comando pode rodar nesta máquina.');
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
      const input = await body(c, TestMcpServer);
      const t = target(input);
      mustApprove(input);
      return c.json(await s.mcpHub.test(t));
    })
    .post('/', async (c) => {
      const input = await body(c, AddMcpServer);
      const t = target(input);
      mustApprove(input);
      const id = serverIdFor(input.name, s.mcpServers.list().map((x) => x.id));
      s.mcpServers.add({ id, name: input.name, ...t, command: t.command ?? undefined, approved: input.approve });
      if (t.transport === 'command') log.info('servidor MCP por comando aprovado', { server: id, program: t.command!.program });
      // What you saw and marked in the form: every tool listed there counts as looked at.
      const marks = new Map(input.tools.map((x) => [x.name, { kind: x.kind, enabled: x.enabled }]));
      await s.mcpHub.refresh(id, marks).catch(() => {});
      return c.json(detail(id), 201);
    })
    .get('/:id', (c) => c.json(detail(c.req.param('id'))))
    .put('/:id', async (c) => {
      const id = c.req.param('id');
      const cur = detail(id);
      const input = await body(c, EditMcpServer);
      target({ transport: cur.transport, url: input.url ?? cur.url, headers: input.headers ?? cur.headers, command: input.command ?? cur.command ?? undefined, env: input.env ?? cur.env });
      s.mcpServers.edit(id, input);
      await reconnect(id);
      return c.json(detail(id));
    })
    .post('/:id/approve', async (c) => {
      const id = c.req.param('id');
      detail(id);
      s.mcpServers.approve(id);
      log.info('servidor MCP por comando aprovado', { server: id });
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
    // "Já vi": the new tools stay as they are (escrita when unmarked) and stop being flagged.
    .post('/:id/review', (c) => {
      const id = c.req.param('id');
      detail(id);
      s.mcpServers.reviewAll(id);
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
