import { createHash } from 'node:crypto';
import type { McpToolKind } from '@orbi/contracts';
import { SECRET_REF } from '../vault/vault.ts';
import type { Effect } from '../brain/domain/levels.ts';
import type { McpCategory } from '../autonomy/policy.ts';

/**
 * MCP servers Orbi uses (docs/funcionalidades/20): the rules, pure. What a tool does, which
 * autonomy rule it falls under, what may be an address, how credentials are written.
 */

/** What the server says about a tool (MCP annotations). Nothing said: null. */
export function hintOf(annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } | null): McpToolKind | null {
  if (!annotations) return null;
  if (annotations.readOnlyHint === true) return 'leitura';
  if (annotations.destructiveHint === true) return 'apaga';
  if (annotations.readOnlyHint === false) return 'escrita';
  return null;
}

/**
 * What counts: your mark, else the server's hint, else escrita (asks before running).
 * Marking "escrita" a tool the server says deletes keeps it as apaga: that never runs alone.
 */
export function effectiveKind(hint: McpToolKind | null, kind: 'leitura' | 'escrita' | null): McpToolKind {
  if (kind === 'leitura') return 'leitura';
  if (kind === 'escrita') return hint === 'apaga' ? 'apaga' : 'escrita';
  return hint ?? 'escrita';
}

export function categoryOf(serverId: string, kind: McpToolKind): McpCategory {
  return kind === 'leitura' ? `mcp:${serverId}:leitura` : `mcp:${serverId}:escrita`;
}

/** Another system: writing there reaches outside this machine; deleting is deleting. */
export function effectOf(kind: McpToolKind): Effect {
  return kind === 'leitura' ? 'leitura' : kind === 'apaga' ? 'apaga' : 'publica';
}

/** The server's id, from its name: lowercase letters, digits and hyphens, unique. */
export function serverIdFor(name: string, taken: readonly string[]): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'servidor';
  let id = base;
  for (let n = 2; taken.includes(id) || id === 'chrome'; n++) id = `${base}-${n}`;
  return id;
}

/** The tool's name for the model: `<server>__<tool>`, only what tool names may carry. */
export function agentToolName(serverId: string, tool: string): string {
  return `${serverId.replace(/-/g, '_')}__${tool.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64);
}

/** Only https outside this machine; plain http only on 127.0.0.1/localhost. */
export function urlProblem(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'Endereço inválido.';
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol === 'https:') return undefined;
  if (u.protocol === 'http:' && local) return undefined;
  return 'Use https (ou http só em 127.0.0.1).';
}

const SENSITIVE = /auth|token|key|secret|senha|password|cookie|session/i;
const refs = (value: string) => [...value.matchAll(new RegExp(SECRET_REF.source, 'gi'))].map((m) => m[1]!.toLowerCase());

/**
 * Credentials only from the vault: a header that carries one (by its name) must use a
 * {{segredo:nome}} reference, and every reference must exist.
 */
export function headerProblems(headers: Record<string, string>, secretExists: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const used = refs(value);
    if (SENSITIVE.test(name) && used.length === 0) out.push(`${name}: credencial só pelo cofre. Escreva a referência, ex.: Bearer {{segredo:jira/token}}.`);
    for (const ref of used) if (!secretExists(ref)) out.push(`${name}: {{segredo:${ref}}} não está no cofre.`);
  }
  return out;
}

// ── servers started by a command (fase 4) ────────────────────────────────

export type McpCommand = { program: string; args: string[] };
export { splitCommand, commandText } from '@orbi/contracts';

/**
 * What you approved: the program, its arguments and its environment (names and references,
 * never values). Any change asks again before the program runs.
 */
export function commandApproval(c: McpCommand, env: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify({ program: c.program, args: c.args, env: sorted })).digest('hex');
}

/** Environment variables follow the header rule: a credential only as a vault reference. */
export function envProblems(env: Record<string, string>, secretExists: (name: string) => boolean): string[] {
  return headerProblems(env, secretExists);
}
