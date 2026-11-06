import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * Flue connects to MCP servers over HTTP only (streamable HTTP or SSE).
 * chrome-devtools-mcp speaks stdio. This bridge runs it as a child process and
 * re-exposes its tools on http://127.0.0.1:<port>/mcp behind a bearer token.
 *
 * It binds to loopback only: the browser it drives may hold the developer's
 * logged-in sessions (portal, ServiceNow), so nothing outside this machine may reach it.
 */
export interface BridgeOptions {
  port: number;
  token: string;
  /** Command + args for the stdio MCP server. Defaults to the bundled chrome-devtools-mcp. */
  command?: string;
  args?: string[];
  /** chrome-devtools-mcp options. Ignored when `command` is given. */
  chrome?: { browserUrl?: string; headless?: boolean; isolated?: boolean; executablePath?: string };
  /** Runs before every tool call, e.g. to launch the shared Chrome on first use. */
  beforeToolCall?: () => Promise<void>;
}

export interface RunningBridge {
  url: string;
  port: number;
  toolNames: string[];
  close(): Promise<void>;
}

function chromeDevtoolsCommand(chrome: NonNullable<BridgeOptions['chrome']>): { command: string; args: string[] } {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve('chrome-devtools-mcp/package.json');
  const bin = (require(pkg) as { bin: Record<string, string> | string }).bin;
  const rel = typeof bin === 'string' ? bin : (bin['chrome-devtools-mcp'] ?? Object.values(bin)[0]);
  const entry = new URL(rel, `file://${pkg}`).pathname;
  const args = [entry, '--usageStatistics=false', '--performanceCrux=false'];
  if (chrome.browserUrl) args.push('--browserUrl', chrome.browserUrl);
  else {
    if (chrome.headless) args.push('--headless');
    if (chrome.isolated) args.push('--isolated');
    if (chrome.executablePath) args.push('--executablePath', chrome.executablePath);
  }
  return { command: process.execPath, args };
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

export async function startBridge(options: BridgeOptions): Promise<RunningBridge> {
  const launch = options.command
    ? { command: options.command, args: options.args ?? [] }
    : chromeDevtoolsCommand(options.chrome ?? {});

  const upstream = new Client({ name: 'orbi-bridge', version: '0.1.0' });
  await upstream.connect(
    new StdioClientTransport({
      command: launch.command,
      args: launch.args,
      env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' } as Record<string, string>,
      stderr: 'pipe',
    }),
  );
  const { tools } = await upstream.listTools();

  // Stateless streamable HTTP: one short-lived MCP server per request, all
  // forwarding to the single long-lived upstream client (and its browser).
  const makeServer = () => {
    const server = new Server({ name: 'orbi-chrome-devtools', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => upstream.listTools());
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await options.beforeToolCall?.();
      return upstream.callTool({ name: request.params.name, arguments: request.params.arguments ?? {} });
    });
    return server;
  };

  const http: HttpServer = createServer(async (req, res) => {
    try {
      if (!req.url?.startsWith('/mcp')) {
        res.writeHead(404).end();
        return;
      }
      if (!authorized(req, options.token)) {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' }).end();
        return;
      }
      const body = await readBody(req);
      const server = makeServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, '127.0.0.1', () => resolve());
  });
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    port,
    toolNames: tools.map((t) => t.name),
    async close() {
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await upstream.close();
    },
  };
}
