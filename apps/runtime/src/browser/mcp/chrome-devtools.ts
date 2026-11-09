import { defineMcpConnection } from '../../agents/runtime-port.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BROWSER_READ_TOOLS } from '../../autonomy/policy.ts';

export interface BrowserMcp {
  /**
   * Native Flue MCP mount for the root agent: read-only browser tools appear to
   * the model as `mcp__chrome__<tool>`. `optional: true` keeps Orbi working
   * (without a browser) when the bridge is down; the model is told.
   * Actions that change a page (click, fill, …) go through `browser_act`, which
   * is governed by the autonomy policy.
   */
  connection: ReturnType<typeof defineMcpConnection>;
  /** Calls one tool on the same bridge, for tools that gate or wrap calls. */
  call(tool: string, args: Record<string, unknown>): Promise<string>;
  url: string;
}

export function createBrowserMcp(opts: { port: number; token: string }): BrowserMcp {
  const url = `http://127.0.0.1:${opts.port}/mcp`;
  const connection = defineMcpConnection({
    name: 'chrome',
    url,
    auth: () => opts.token,
    tools: [...BROWSER_READ_TOOLS],
    optional: true,
    timeoutMs: 90_000,
  });

  let client: Promise<Client> | undefined;
  const connect = () =>
    (client ??= (async () => {
      const c = new Client({ name: 'orbi', version: '0.1.0' });
      await c.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${opts.token}` } } }));
      return c;
    })().catch((error) => {
      client = undefined;
      throw error;
    }));

  async function call(tool: string, args: Record<string, unknown>): Promise<string> {
    const c = await connect();
    const result = (await c.callTool({ name: tool, arguments: args })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const text = (result.content ?? []).map((part) => (part.type === 'text' ? part.text : `[${part.type}]`)).join('\n');
    if (result.isError) throw new Error(text || `browser tool ${tool} failed`);
    return text.length > 30_000 ? `${text.slice(0, 30_000)}\n…[truncado]` : text;
  }

  return { connection, call, url };
}
