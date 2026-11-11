import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServer, McpTestResult } from '@orbi/contracts';
import { redact, type Vault } from '../vault/vault.ts';
import { effectiveKind, hintOf } from './domain.ts';
import type { DiscoveredTool, McpServers } from './store.ts';

type Conn = { client: Client; secrets: string[] };
const CONNECT_MS = 15_000;
const MAX_OUTPUT = 30_000;

/**
 * One MCP client per server the developer added (docs/funcionalidades/20). Header credentials are
 * resolved from the vault only here, when connecting; what a server returns, and its errors, go
 * out without those values. Nothing here decides autonomy: the agent's tools go through the gate.
 */
export class McpHub {
  private readonly conns = new Map<string, Promise<Conn>>();
  private readonly states = new Map<string, McpServer['state']>();

  constructor(private readonly store: McpServers, private readonly vault: Pick<Vault, 'resolve'>) {}

  state(id: string): McpServer['state'] {
    const s = this.store.get(id);
    if (!s?.enabled) return 'desligado';
    return this.states.get(id) ?? (s.lastError ? 'erro' : 'conectando');
  }

  /** Connects without saving anything and lists the tools, for the "Testar conexão" button. */
  async test(url: string, headers: Record<string, string>): Promise<McpTestResult> {
    let conn: Conn | undefined;
    try {
      conn = await this.open(url, headers);
      const tools = await listAll(conn.client);
      return { ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description, hint: t.hint, effective: effectiveKind(t.hint, null) })) };
    } catch (error) {
      return { ok: false, error: redact(messageOf(error), conn?.secrets ?? []) };
    } finally {
      await conn?.client.close().catch(() => {});
    }
  }

  /** (Re)connects a saved server and brings its tool list up to date. */
  async refresh(id: string, marks?: Parameters<McpServers['sync']>[2]): Promise<void> {
    await this.disconnect(id);
    const s = this.store.get(id);
    if (!s?.enabled) return;
    this.states.set(id, 'conectando');
    let secrets: string[] = [];
    try {
      const conn = this.conns.get(id) ?? this.connect(id);
      secrets = (await conn).secrets;
      this.store.sync(id, await listAll((await conn).client), marks);
      this.store.setError(id, null);
      this.states.set(id, 'conectado');
    } catch (error) {
      this.conns.delete(id);
      this.store.setError(id, redact(messageOf(error), secrets).slice(0, 500));
      this.states.set(id, 'erro');
      throw error;
    }
  }

  /** Calls one tool. The text comes back without credential values, cut at 30 000 characters. */
  async call(id: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const conn = await (this.conns.get(id) ?? this.connect(id));
    const { value, used } = await this.vault.resolve(args);
    const secrets = [...conn.secrets, ...used];
    try {
      const result = (await conn.client.callTool({ name: tool, arguments: value }, undefined, signal ? { signal } : undefined)) as {
        content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean;
      };
      const parts = (result.content ?? []).map((p) => (p.type === 'text' ? p.text ?? '' : `[${p.type}]`));
      const text = redact(parts.join('\n') || (result.structuredContent ? JSON.stringify(result.structuredContent) : ''), secrets);
      if (result.isError) throw new Error(text || `${tool} falhou`);
      return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…[truncado]` : text;
    } catch (error) {
      // A dropped connection: the next call connects again.
      if (/fetch failed|ECONNREFUSED|socket|closed/i.test(messageOf(error))) this.conns.delete(id);
      throw new Error(redact(messageOf(error), secrets));
    }
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.conns.get(id);
    this.conns.delete(id);
    this.states.delete(id);
    await conn?.then((c) => c.client.close()).catch(() => {});
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.conns.keys()].map((id) => this.disconnect(id)));
  }

  private connect(id: string): Promise<Conn> {
    const s = this.store.get(id);
    if (!s) return Promise.reject(new Error(`servidor MCP ${id} não existe`));
    if (!s.enabled) return Promise.reject(new Error(`servidor MCP ${s.name} está desligado`));
    const conn = this.open(s.url, s.headers);
    this.conns.set(id, conn);
    conn.catch(() => this.conns.delete(id));
    return conn;
  }

  private async open(url: string, headers: Record<string, string>): Promise<Conn> {
    const { value, used } = await this.vault.resolve(headers);
    const client = new Client({ name: 'orbi', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: value } });
    try {
      await withTimeout(client.connect(transport), CONNECT_MS, 'o servidor não respondeu a tempo');
    } catch (error) {
      await client.close().catch(() => {});
      throw new Error(redact(messageOf(error), used));
    }
    return { client, secrets: used };
  }
}

async function listAll(client: Client): Promise<DiscoveredTool[]> {
  const out: DiscoveredTool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    for (const t of page.tools) out.push({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema, hint: hintOf(t.annotations) });
    cursor = page.nextCursor;
  } while (cursor && out.length < 500);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
