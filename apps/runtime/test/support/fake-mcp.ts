import { createServer, type IncomingMessage } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

/**
 * A fake "issue tracker" MCP server on 127.0.0.1 for the tests (docs/funcionalidades/20): a tool
 * the server says reads, one that writes, one that deletes and one it says nothing about. It
 * needs `Authorization: Bearer <token>`, and its search answer echoes the token so the tests
 * can check it never reaches the conversation.
 */
export async function startFakeMcp(token: string) {
  const calls: Array<{ tool: string; args: unknown; auth?: string }> = [];
  let auth: string | undefined;
  const make = () => {
    const s = new McpServer({ name: 'issues-falso', version: '1.0.0' });
    s.registerTool('buscar_issue', { description: 'Busca issues por texto', inputSchema: { texto: z.string().describe('o que procurar') }, annotations: { readOnlyHint: true } },
      async (args) => { calls.push({ tool: 'buscar_issue', args, auth }); return { content: [{ type: 'text', text: `achei PAG-12 (consultado com ${auth})` }] }; });
    s.registerTool('criar_issue', { description: 'Cria uma issue', inputSchema: { projeto: z.string(), titulo: z.string(), prioridade: z.enum(['baixa', 'alta']).optional() }, annotations: { readOnlyHint: false } },
      async (args) => { calls.push({ tool: 'criar_issue', args, auth }); return { content: [{ type: 'text', text: `criada PAG-13: ${args.titulo}` }] }; });
    s.registerTool('apagar_issue', { description: 'Apaga uma issue', inputSchema: { id: z.string() }, annotations: { destructiveHint: true, readOnlyHint: false } },
      async (args) => { calls.push({ tool: 'apagar_issue', args, auth }); return { content: [{ type: 'text', text: 'apagada' }] }; });
    s.registerTool('comentar', { description: 'Comenta numa issue', inputSchema: { id: z.string(), texto: z.string() } },
      async (args) => { calls.push({ tool: 'comentar', args, auth }); return { content: [{ type: 'text', text: 'ok' }] }; });
    return s;
  };
  const http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) return void res.writeHead(401).end('{"error":"unauthorized"}');
    auth = req.headers.authorization;
    const body = await readJson(req);
    const server = make();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  const port = (http.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/mcp`, calls, close: () => new Promise<void>((r) => { http.close(() => r()); http.closeAllConnections(); }) };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}
