/**
 * As ferramentas: a gravação no navegador, os agentes de código, os servidores MCP e o Chrome.
 */

export interface Target { role: string; name: string; label?: string; context?: string }

export interface DemoAction { t: number; kind: string; url: string; title?: string; tab: number; target?: Target; value?: string; secret?: string; text: string }

export interface NarrationSegment { t: number; durationMs: number; status: 'pending' | 'done' | 'error'; text: string; error?: string }

export interface Recording {
  id: string; conversationId: string; status: 'recording' | 'transcribing' | 'done' | 'discarded'; startedAt: string; finishedAt?: string;
  startUrl?: string; actions: DemoAction[]; narration: NarrationSegment[]; secrets: string[]; narrated: boolean; transcriber?: string;
}

/** Coding agents of this machine (Autonomia › Agentes de código). */
export type CodeAgentTask = 'investigar' | 'corrigir' | 'diagnosticar';

export interface CodeAgent {
  id: string; name: string; binary: string;
  /** One-shot command: `{prompt}` is the request, `{modelo}` the task's model. */
  command: string; models: string[];
  source: 'catalogo' | 'ajuda' | 'manual' | 'env';
  /** `background` (default): hidden; `window`: a terminal window the developer sees and follows. */
  runIn: 'window' | 'background';
  lastTest: { at: string; ok: boolean; detail: string } | null;
  createdAt: string; updatedAt: string;
}

export interface CodeAgentAssignment { task: CodeAgentTask; agent: string; model: string | null }

export interface CodeAgentCatalogEntry { id: string; name: string; binary: string; command: string; models: string[]; note?: string }

/** GET /api/code-agents */
export interface CodeAgentsState { agents: CodeAgent[]; tasks: CodeAgentAssignment[]; catalog: CodeAgentCatalogEntry[] }

/** GET /api/model/roles — the model of each kind of work, and whether you set it. */
/** What a tool of an MCP server does: what the server says, what you marked, what counts. */
export type McpToolKind = 'leitura' | 'escrita' | 'apaga';

export interface McpTool {
  name: string;
  description: string;
  /** From the server (readOnlyHint, destructiveHint); null when it says nothing. */
  hint: McpToolKind | null;
  /** What you marked; null: not marked. */
  kind: 'leitura' | 'escrita' | null;
  /** What counts: what you marked, else the hint, else escrita. */
  effective: McpToolKind;
  enabled: boolean;
  /** You chose "sempre sozinho": it runs without asking (never for one that deletes; "observar" still holds). */
  alone: boolean;
  /** Appeared after you saved the server and you have not marked it yet. */
  isNew: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  /** http: an address; command: a program Orbi starts on this machine (stdio). */
  transport: 'http' | 'command';
  url: string;
  /** Header values carry only vault references ({{segredo:nome}}). */
  headers: Record<string, string>;
  /** The program and its arguments, for transport command. */
  command: { program: string; args: string[] } | null;
  /** Environment of the program: values with credentials only as vault references. */
  env: Record<string, string>;
  enabled: boolean;
  /** aprovar: the command is new or changed and waits for you before it runs. */
  state: 'conectado' | 'erro' | 'desligado' | 'conectando' | 'aprovar';
  error: string | null;
  counts: { leitura: number; escrita: number; novas: number };
}

export interface McpServerDetail extends McpServer { tools: McpTool[] }

/** POST /api/mcp-servers/test: connects without saving and lists the tools. */
export type McpTestResult =
  | { ok: true; tools: Array<{ name: string; description: string; hint: McpToolKind | null; effective: McpToolKind }> }
  | { ok: false; error: string };

/** GET /api/browser/settings: how Orbi's browser runs. Ports are shown, not edited here. */
export interface ChromeSettings {
  /** proprio: Orbi's own profile; seu: attach to the developer's Chrome (remote debugging on). */
  browser: 'proprio' | 'seu';
  browserUrl: string | null;
  showWindow: boolean;
  autostart: boolean;
  profileDir: string;
  executablePath: string | null;
  /** The Chrome found on this machine, or why none was. */
  detected: string | null;
  detectError: string | null;
  port: number;
  debugPort: number;
}
