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
  /**
   * `signal`: give up waiting (the developer stopped the turn). `full`: the whole answer, for a
   * caller that writes it to a file; without it the text is cut to what a model should read.
   */
  call(tool: string, args: Record<string, unknown>, signal?: AbortSignal, opts?: { full?: boolean }): Promise<string>;
  url: string;
}

/** What goes back to a model from one browser call; a file (saveTo) gets everything. */
export const MAX_FOR_MODEL = 30_000;

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

  async function call(tool: string, args: Record<string, unknown>, signal?: AbortSignal, opts: { full?: boolean } = {}): Promise<string> {
    const c = await connect();
    const result = (await c.callTool({ name: tool, arguments: args }, undefined, signal ? { signal } : undefined)) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const text = (result.content ?? []).map((part) => (part.type === 'text' ? part.text : `[${part.type}]`)).join('\n');
    if (result.isError) throw new Error(text || `browser tool ${tool} failed`);
    return !opts.full && text.length > MAX_FOR_MODEL ? `${text.slice(0, MAX_FOR_MODEL)}\n…[truncado]` : text;
  }

  return { connection, call, url };
}
