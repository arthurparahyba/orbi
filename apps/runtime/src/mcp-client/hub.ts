import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer, McpTestResult } from '@orbi/contracts';
import { redact, type Vault } from '../vault/vault.ts';
import { commandText, effectiveKind, hintOf, type McpCommand } from './domain.ts';
import { needsApproval, type DiscoveredTool, type McpServers } from './store.ts';

type Conn = { client: Client; secrets: string[]; pid?: number | null };
/** How to reach a server: an address with headers, or a program with its environment. */
export type McpTarget = { transport: 'http' | 'command'; url?: string; headers?: Record<string, string>; command?: McpCommand | null; env?: Record<string, string> };
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

  /** Children started by command servers: killed with the runtime, even on a sudden exit. */
  private readonly pids = new Set<number>();

  /** `workDir`: each command server runs in its own folder under it (dados/mcp/<id>). */
  constructor(private readonly store: McpServers, private readonly vault: Pick<Vault, 'resolve'>, private readonly workDir: string) {}

  state(id: string): McpServer['state'] {
    const s = this.store.get(id);
    if (!s?.enabled) return 'desligado';
    if (needsApproval(s)) return 'aprovar';
    return this.states.get(id) ?? (s.lastError ? 'erro' : 'conectando');
  }

  /** Connects without saving anything and lists the tools, for the "Testar conexão" button. */
  async test(target: McpTarget): Promise<McpTestResult> {
    let conn: Conn | undefined;
    try {
      conn = await this.open(target, 'teste');
      const tools = await listAll(conn.client);
      return { ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description, hint: t.hint, effective: effectiveKind(t.hint, null) })) };
    } catch (error) {
      return { ok: false, error: redact(messageOf(error), conn?.secrets ?? []) };
    } finally {
      if (conn?.pid) this.pids.delete(conn.pid);
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
    await conn?.then((c) => { if (c.pid) this.pids.delete(c.pid); return c.client.close(); }).catch(() => {});
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.conns.keys()].map((id) => this.disconnect(id)));
  }

  private connect(id: string): Promise<Conn> {
    const s = this.store.get(id);
    if (!s) return Promise.reject(new Error(`servidor MCP ${id} não existe`));
    if (!s.enabled) return Promise.reject(new Error(`servidor MCP ${s.name} está desligado`));
    // A program only runs as you approved it: a new or changed command waits for you.
    if (needsApproval(s)) return Promise.reject(new Error(`o comando de ${s.name} mudou ou ainda não foi aprovado: aprove em Autonomia › Ferramentas (MCP)`));
    const conn = this.open(s, id);
    this.conns.set(id, conn);
    conn.catch(() => this.conns.delete(id));
    return conn;
  }

  /** Kills the programs of command servers now (sync: for the runtime's 'exit' handler). */
  killNow(): void {
    for (const pid of this.pids) {
      try { process.kill(pid); } catch { /* already gone */ }
    }
    this.pids.clear();
  }

  private async open(target: McpTarget, folder: string): Promise<Conn> {
    const client = new Client({ name: 'orbi', version: '0.1.0' });
    if (target.transport === 'command') return this.openCommand(client, target, folder);
    const { value, used } = await this.vault.resolve(target.headers ?? {});
    const transport = new StreamableHTTPClientTransport(new URL(target.url ?? ''), { requestInit: { headers: value } });
    try {
      await withTimeout(client.connect(transport), CONNECT_MS, 'o servidor não respondeu a tempo');
    } catch (error) {
      await client.close().catch(() => {});
      throw new Error(redact(messageOf(error), used));
    }
    return { client, secrets: used };
  }

  /**
   * A program on this machine, spoken to over stdio, without a shell: the SDK passes only a few
   * safe variables of the runtime (PATH, HOME…) plus the declared ones, resolved from the vault.
   */
  private async openCommand(client: Client, target: McpTarget, folder: string): Promise<Conn> {
    if (!target.command) throw new Error('sem comando');
    const { value: env, used } = await this.vault.resolve(target.env ?? {});
    const cwd = join(this.workDir, folder.replace(/[^a-z0-9-]/gi, '_'));
    mkdirSync(cwd, { recursive: true });
    const transport = new StdioClientTransport({ command: target.command.program, args: target.command.args, env, cwd, stderr: 'pipe' });
    // The program's own messages: kept short for the error, never logged whole.
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-1500); });
    try {
      await withTimeout(client.connect(transport), CONNECT_MS * 4, 'o programa não respondeu a tempo');
    } catch (error) {
      await client.close().catch(() => {});
      const said = stderr.trim() ? ` · o programa disse: ${stderr.trim().split('\n').slice(-3).join(' ')}` : '';
      throw new Error(redact(`${commandText(target.command)}: ${messageOf(error)}${said}`, used));
    }
    const pid = transport.pid;
    if (pid) this.pids.add(pid);
    return { client, secrets: used, pid };
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
