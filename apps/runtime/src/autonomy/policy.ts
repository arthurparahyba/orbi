import type { DatabaseSync } from 'node:sqlite';
import { decideAction, type Effect, type Level, type LevelBy } from '../brain/domain/levels.ts';
import { commandEffectOf, commandReads } from '../commands/index.ts';

/**
 * Autonomy levels, the same three the Rotinas screen shows:
 * - observe: Orbi only reports what it would do; the action is not executed.
 * - ask: Orbi prepares the action and waits for the developer's approval.
 * - auto: Orbi acts and reports afterwards.
 *
 * Two layers decide a call:
 * 1. Each learned playbook carries its own autonomy. While a playbook marked
 *    `auto` is running, its ordinary steps (commands, browser actions) run freely.
 * 2. Outside a playbook, or for the sensitive categories below, the global
 *    category level applies.
 */
export type AutonomyLevel = 'observe' | 'ask' | 'auto';

export type FixedCategory =
  | 'comandos-leitura'
  | 'comandos-escrita'
  | 'navegador-leitura'
  | 'navegador-escrita'
  | 'codigo-teste'
  | 'codigo-producao'
  | 'aprender';
/** The two rules of each MCP server the developer added (docs/funcionalidades/20). */
export type McpCategory = `mcp:${string}:leitura` | `mcp:${string}:escrita`;
export type Category = FixedCategory | McpCategory;

export interface AutonomyPolicy {
  categories: Record<FixedCategory, AutonomyLevel> & Partial<Record<McpCategory, AutonomyLevel>>;
}

const MCP_CATEGORY = /^mcp:[a-z0-9][a-z0-9-]{0,39}:(leitura|escrita)$/;
export const isMcpCategory = (c: string): c is McpCategory => MCP_CATEGORY.test(c);
/** An MCP server's rule before the developer sets it: reads alone, writes ask. */
const mcpDefault = (c: McpCategory): AutonomyLevel => (c.endsWith(':leitura') ? 'auto' : 'ask');
/** The level of a category now: what the developer set, else its default. */
export function levelOf(policy: AutonomyPolicy, category: Category): AutonomyLevel {
  return policy.categories[category] ?? (isMcpCategory(category) ? mcpDefault(category) : 'ask');
}

export const DEFAULT_POLICY: AutonomyPolicy = {
  categories: {
    'comandos-leitura': 'auto',
    'comandos-escrita': 'ask',
    'navegador-leitura': 'auto',
    'navegador-escrita': 'ask',
    'codigo-teste': 'auto',
    'codigo-producao': 'ask',
    aprender: 'ask',
  },
};

/** Categories a running `auto` playbook cannot override. */
const ALWAYS_GLOBAL: ReadonlySet<Category> = new Set(['codigo-producao', 'aprender']);

const LEVELS: readonly AutonomyLevel[] = ['observe', 'ask', 'auto'];

export function parsePolicy(raw: unknown): AutonomyPolicy {
  const categories = { ...DEFAULT_POLICY.categories };
  const source = (raw as { categories?: Record<string, unknown> } | null)?.categories ?? {};
  for (const [name, level] of Object.entries(source)) {
    if ((name in categories || isMcpCategory(name)) && LEVELS.includes(level as AutonomyLevel)) {
      (categories as Record<string, AutonomyLevel>)[name] = level as AutonomyLevel;
    }
  }
  return { categories };
}

export function decide(
  policy: AutonomyPolicy,
  category: Category,
  activePlaybook?: { autonomy: AutonomyLevel; level?: Level; levelBy?: LevelBy; name?: string } | null,
  action?: { known: boolean; effect: Effect },
): AutonomyLevel {
  const global = levelOf(policy, category);
  if (category === 'aprender') return global === 'observe' ? 'observe' : 'ask'; // learning always waits
  if (!activePlaybook || ALWAYS_GLOBAL.has(category)) return global;
  // Inside a playbook its own level wins, but it can only loosen what the developer
  // allowed globally from "ask" to "auto" — never act where the global is "observe".
  if (global === 'observe' || activePlaybook.autonomy === 'observe') return 'observe';
  // A playbook never tightens what the developer let run on its own: reads stay as set globally.
  if ((category.endsWith('-leitura') || category.endsWith(':leitura')) && global === 'auto') return 'auto';
  if (activePlaybook.level === undefined || !action) return activePlaybook.autonomy;
  return decideAction({ level: activePlaybook.level, levelBy: activePlaybook.levelBy ?? 'learned' }, action);
}

/** The effect a category implies when the tool does not say more. */
export function effectOfCategory(category: Category): Effect {
  if (category.endsWith('-leitura') || category.endsWith(':leitura')) return 'leitura';
  // An MCP server is another system: writing there reaches outside this machine.
  if (isMcpCategory(category)) return 'publica';
  return category === 'navegador-escrita' ? 'publica' : 'local';
}

// ── command classification ────────────────────────────────────────────────
// What each CLI does lives in src/commands/ (one profile per CLI): the policy only looks it up.

export { gitVerbArgs } from '../commands/index.ts';

/** What a command does to the world (commands/<cli>.ts): `publica` reaches outside this machine, `apaga` removes. */
export function commandEffect(binary: string, args: readonly string[]): 'leitura' | 'local' | 'publica' | 'apaga' {
  return commandEffectOf(binary, args);
}

export function commandCategory(binary: string, args: readonly string[]): Category {
  return commandReads(binary, args) ? 'comandos-leitura' : 'comandos-escrita';
}

// ── code fixes ────────────────────────────────────────────────────────────

const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|Test\.(java|kt)$|_test\.(go|py)$/;

/** A code fix counts as "test only" when every changed path is a test file. */
export function isTestOnlyChange(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every((path) => TEST_FILE.test(path));
}

export function codeFixCategory(paths: readonly string[]): Category {
  return isTestOnlyChange(paths) ? 'codigo-teste' : 'codigo-producao';
}

// ── browser (Chrome DevTools MCP tool names) ──────────────────────────────

export const BROWSER_READ_TOOLS = [
  'list_pages', 'select_page', 'new_page', 'navigate_page', 'take_snapshot', 'take_screenshot', 'wait_for',
  'list_console_messages', 'get_console_message', 'list_network_requests', 'get_network_request',
] as const;

export function browserCategory(tool: string): Category {
  return (BROWSER_READ_TOOLS as readonly string[]).includes(tool) ? 'navegador-leitura' : 'navegador-escrita';
}

/** The developer's autonomy settings, kept in the `settings` table. */
export class PolicyStore {
  private policy: AutonomyPolicy;
  constructor(private readonly db: DatabaseSync) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'autonomy'").get() as { value: string } | undefined;
    this.policy = row ? parsePolicy(JSON.parse(row.value)) : DEFAULT_POLICY;
  }
  get(): AutonomyPolicy {
    return this.policy;
  }
  set(category: Category, level: AutonomyLevel): AutonomyPolicy {
    if (!(category in DEFAULT_POLICY.categories) && !isMcpCategory(category)) throw new Error(`categoria inválida: ${category}`);
    if (!LEVELS.includes(level)) throw new Error(`nível inválido: ${level}`);
    this.replace({ categories: { ...this.policy.categories, [category]: level } });
    return this.policy;
  }
  /** A removed MCP server takes its two rules with it. */
  forgetMcp(serverId: string): void {
    const rest = Object.fromEntries(Object.entries(this.policy.categories).filter(([k]) => !k.startsWith(`mcp:${serverId}:`)));
    this.replace({ categories: rest });
  }
  /** Replaces the whole policy (validated); used to import the old autonomy.json. */
  replace(policy: unknown): void {
    this.policy = parsePolicy(policy);
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('autonomy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(this.policy));
  }
}
