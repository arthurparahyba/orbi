import * as v from 'valibot';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../observability/log.ts';
import { ToolError, toolsFor, type McpCall } from './tools.ts';
import instructions from '../prompts/mcp-servidor.md?raw';

/**
 * Orbi as an MCP server for coding agents on this machine (Claude Code,
 * Cursor…). Stateless: each HTTP request gets its own server and transport,
 * so there are no sessions to keep or leak. The caller was authenticated by
 * the route (http/routes/mcp.ts); the tools it sees depend on its permissions.
 */
export async function handleMcp(request: Request, call: McpCall): Promise<Response> {
  const server = new Server({ name: 'orbi', version: '0.1.0' }, { capabilities: { tools: {} }, instructions });
  const tools = toolsFor(call.client);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as { type: 'object' } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const t = tools.find((x) => x.name === req.params.name);
    if (!t) return failure(`ferramenta indisponível para este agente: ${req.params.name}`);
    const parsed = v.safeParse(t.input, req.params.arguments ?? {});
    if (!parsed.success) {
      return failure(`argumentos inválidos: ${parsed.issues.map((i) => `${v.getDotPath(i) ?? 'argumentos'}: ${i.message}`).join('; ')}`);
    }
    const started = Date.now();
    try {
      const result = await t.run(parsed.output, call);
      log.info('mcp: chamada de agente', { agent: call.client.name, tool: t.name, ms: Date.now() - started });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      if (error instanceof ToolError) return failure(error.message);
      log.error('mcp: ferramenta falhou', { agent: call.client.name, tool: t.name, error });
      return failure('o Orbi não conseguiu atender agora; tente de novo mais tarde');
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

const failure = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] });
