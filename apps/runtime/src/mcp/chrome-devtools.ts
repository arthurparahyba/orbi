import { defineMcpConnection } from '@flue/runtime';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from '../config.ts';
import { BROWSER_READ_TOOLS } from '../policy/autonomy.ts';

export const chromeBridgeUrl = () => `http://127.0.0.1:${config.chrome.port}/mcp`;

/**
 * Native Flue MCP mount for the root agent: read-only browser tools appear to
 * the model as `mcp__chrome__<tool>`. `optional: true` keeps Orbi working
 * (without a browser) when the bridge is down; the model is told.
 * Actions that change a page (click, fill, …) go through `browser_act`, which
 * is governed by the autonomy policy.
 */
export const chromeDevtoolsRead = defineMcpConnection({
  name: 'chrome',
  url: chromeBridgeUrl(),
  auth: () => config.chrome.token,
  tools: [...BROWSER_READ_TOOLS],
  optional: true,
  timeoutMs: 90_000,
});

/** Direct client to the same bridge, for tools that need to gate or wrap calls. */
let client: Promise<Client> | undefined;

export function chromeClient(): Promise<Client> {
  client ??= (async () => {
    const c = new Client({ name: 'orbi', version: '0.1.0' });
    await c.connect(
      new StreamableHTTPClientTransport(new URL(chromeBridgeUrl()), {
        requestInit: { headers: { authorization: `Bearer ${config.chrome.token}` } },
      }),
    );
    return c;
  })().catch((error) => {
    client = undefined;
    throw error;
  });
  return client;
}

export async function callBrowserTool(tool: string, args: Record<string, unknown>): Promise<string> {
  const c = await chromeClient();
  const result = (await c.callTool({ name: tool, arguments: args })) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = (result.content ?? [])
    .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
    .join('\n');
  if (result.isError) throw new Error(text || `browser tool ${tool} failed`);
  return text.length > 30_000 ? `${text.slice(0, 30_000)}\n…[truncado]` : text;
}
