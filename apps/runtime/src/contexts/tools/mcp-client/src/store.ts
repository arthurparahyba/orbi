import type { DatabaseSync } from 'node:sqlite';
import type { McpServer, McpTool, McpToolKind } from '@orbi/contracts';
import { commandApproval, effectiveKind, type McpCommand } from './domain.ts';

/** A tool as the server lists it (tools/list). */
export interface DiscoveredTool { name: string; description: string; inputSchema: unknown; hint: McpToolKind | null }
export interface ServerRow {
  id: string; name: string; transport: 'http' | 'command'; url: string; headers: Record<string, string>;
  command: McpCommand | null; env: Record<string, string>; enabled: boolean; lastError: string | null;
  /** The command you approved (commandApproval); null: never approved. */
  approvedCommand: string | null;
}
/** A command server whose command (or environment) changed since you approved it, or never was. */
export const needsApproval = (s: ServerRow) => s.transport === 'command' && (!s.command || commandApproval(s.command, s.env) !== s.approvedCommand);
export interface ToolRow extends McpTool { inputSchema: unknown }

type Raw = Record<string, unknown>;
const now = () => new Date().toISOString();

/** The MCP servers the developer added and their tools (tables mcp_servers, mcp_tools). */
export class McpServers {
  constructor(private readonly db: DatabaseSync) {}

  list(): ServerRow[] {
    return (this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at').all() as Raw[]).map(serverOf);
  }

  get(id: string): ServerRow | undefined {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Raw | undefined;
    return row ? serverOf(row) : undefined;
  }

  add(s: { id: string; name: string; transport?: 'http' | 'command'; url?: string; headers?: Record<string, string>; command?: McpCommand; env?: Record<string, string>; approved?: boolean }): void {
    const t = now();
    const approved = s.approved && s.command ? commandApproval(s.command, s.env ?? {}) : null;
    this.db.prepare('INSERT INTO mcp_servers (id, name, transport, url, headers, command, env, enabled, approved_command, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
      .run(s.id, s.name, s.transport ?? 'http', s.url ?? '', JSON.stringify(s.headers ?? {}), s.command ? JSON.stringify(s.command) : null, JSON.stringify(s.env ?? {}), approved, t, t);
  }

  edit(id: string, p: { url?: string; headers?: Record<string, string>; command?: McpCommand; env?: Record<string, string>; enabled?: boolean }): void {
    const cur = this.get(id);
    if (!cur) return;
    // A changed command or environment keeps the old approval, which no longer matches: it asks again.
    this.db.prepare('UPDATE mcp_servers SET url = ?, headers = ?, command = ?, env = ?, enabled = ?, updated_at = ? WHERE id = ?')
      .run(p.url ?? cur.url, JSON.stringify(p.headers ?? cur.headers), JSON.stringify(p.command ?? cur.command), JSON.stringify(p.env ?? cur.env), (p.enabled ?? cur.enabled) ? 1 : 0, now(), id);
  }

  /** You confirmed that this command, as it is now, may run on this machine. */
  approve(id: string): void {
    const cur = this.get(id);
    if (cur?.command) this.db.prepare('UPDATE mcp_servers SET approved_command = ?, updated_at = ? WHERE id = ?').run(commandApproval(cur.command, cur.env), now(), id);
  }

  setError(id: string, error: string | null): void {
    this.db.prepare('UPDATE mcp_servers SET last_error = ? WHERE id = ? AND COALESCE(last_error, \'\') <> COALESCE(?, \'\')').run(error, id, error);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM mcp_tools WHERE server_id = ?').run(id);
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  }

  tools(serverId: string): ToolRow[] {
    return (this.db.prepare('SELECT * FROM mcp_tools WHERE server_id = ? ORDER BY name').all(serverId) as Raw[]).map(toolOf);
  }

  /**
   * What the server lists now. A tool seen before keeps what you marked; a new one comes in on,
   * unmarked (counts as escrita) and flagged until you look at it. `marks`: the first save,
   * where you already saw every tool.
   */
  sync(serverId: string, found: DiscoveredTool[], marks?: Map<string, { kind: 'leitura' | 'escrita' | null; enabled: boolean }>): void {
    const t = now();
    const upsert = this.db.prepare(`INSERT INTO mcp_tools (server_id, name, description, input_schema, hint, kind, enabled, reviewed, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id, name) DO UPDATE SET description = excluded.description, input_schema = excluded.input_schema, hint = excluded.hint, last_seen = excluded.last_seen`);
    for (const f of found) {
      const mark = marks?.get(f.name);
      // A tool that deletes comes in off; anything else on.
      const enabled = mark ? mark.enabled : f.hint !== 'apaga';
      upsert.run(serverId, f.name, f.description.slice(0, 2000), JSON.stringify(f.inputSchema ?? {}), f.hint, mark?.kind ?? null, enabled ? 1 : 0, marks ? 1 : 0, t, t);
    }
    // Gone from the server: gone from here.
    const names = found.map((f) => f.name);
    for (const old of this.tools(serverId)) if (!names.includes(old.name)) this.db.prepare('DELETE FROM mcp_tools WHERE server_id = ? AND name = ?').run(serverId, old.name);
  }

  /** Your choices for a tool. Looking at it counts as reviewed; "sempre sozinho" never sticks to one that deletes. */
  setTool(serverId: string, name: string, p: { kind?: 'leitura' | 'escrita' | null; enabled?: boolean; alone?: boolean; reviewed?: boolean }): boolean {
    const cur = this.tools(serverId).find((x) => x.name === name);
    if (!cur) return false;
    const kind = p.kind === undefined ? cur.kind : p.kind;
    const alone = (p.alone ?? cur.alone) && effectiveKind(cur.hint, kind) !== 'apaga';
    this.db.prepare('UPDATE mcp_tools SET kind = ?, enabled = ?, alone = ?, reviewed = 1 WHERE server_id = ? AND name = ?')
      .run(kind, (p.enabled ?? cur.enabled) ? 1 : 0, alone ? 1 : 0, serverId, name);
    return true;
  }

  /** Every new tool of a server marked as seen, as it is (escrita if unmarked). */
  reviewAll(serverId: string): void {
    this.db.prepare('UPDATE mcp_tools SET reviewed = 1 WHERE server_id = ? AND reviewed = 0').run(serverId);
  }

  /** The list's line: counts and state (state comes from the hub). */
  summary(s: ServerRow, state: McpServer['state']): McpServer {
    const tools = this.tools(s.id).filter((x) => x.enabled);
    return {
      id: s.id, name: s.name, transport: s.transport, url: s.url, headers: s.headers, command: s.command, env: s.env,
      enabled: s.enabled, state: s.enabled && needsApproval(s) ? 'aprovar' : state, error: s.lastError,
      counts: { leitura: tools.filter((x) => x.effective === 'leitura').length, escrita: tools.filter((x) => x.effective !== 'leitura').length, novas: this.tools(s.id).filter((x) => x.isNew).length },
    };
  }
}

function serverOf(r: Raw): ServerRow {
  return {
    id: String(r.id), name: String(r.name), transport: r.transport === 'command' ? 'command' : 'http', url: String(r.url ?? ''),
    headers: JSON.parse(String(r.headers ?? '{}')), command: r.command ? (JSON.parse(String(r.command)) as McpCommand) : null,
    env: JSON.parse(String(r.env ?? '{}')), enabled: r.enabled === 1, lastError: (r.last_error as string | null) ?? null,
    approvedCommand: (r.approved_command as string | null) ?? null,
  };
}

function toolOf(r: Raw): ToolRow {
  const hint = (r.hint as McpToolKind | null) ?? null;
  const kind = (r.kind as 'leitura' | 'escrita' | null) ?? null;
  return {
    name: String(r.name), description: String(r.description ?? ''), hint, kind, effective: effectiveKind(hint, kind),
    enabled: r.enabled === 1, alone: r.alone === 1 && effectiveKind(hint, kind) !== 'apaga', isNew: r.reviewed !== 1 && kind === null, inputSchema: JSON.parse(String(r.input_schema ?? '{}')),
  };
}
