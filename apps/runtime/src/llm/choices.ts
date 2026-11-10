import type { DatabaseSync } from 'node:sqlite';
import type { ModelTier } from '@orbi/plugin-sdk';
import type { ActiveLlm } from './index.ts';
import { ADAPTER_PROVIDER } from './pi-bridge.ts';
import { CLAUDE_MODELS } from './setup.ts';

/**
 * Which models a conversation may use: the active provider's (the plugin's list, or Claude's),
 * the default first, each with how costly it is. The tier comes from the developer (set in the
 * app), else from the plugin, else from a known model family; none = not classified yet.
 */
export interface ModelChoice { id: string; tier?: ModelTier; tierBy?: 'voce' | 'plugin' | 'conhecido' }
export interface ModelChoices { default: string; models: ModelChoice[] }

const short = (spec: string) => spec.slice(spec.indexOf('/') + 1);

/** Claude's families, by name: the only ones the Orbi knows by itself. */
export function knownTier(id: string): ModelTier | undefined {
  if (/haiku/i.test(id)) return 'cheap';
  if (/sonnet/i.test(id)) return 'standard';
  if (/opus|fable|mythos/i.test(id)) return 'premium';
  return undefined;
}

export function modelChoices(llm: Pick<ActiveLlm, 'model' | 'adapter' | 'anthropic'>, mine: Record<string, ModelTier>): ModelChoices {
  const def = short(llm.model);
  const declared = new Map((llm.adapter?.models ?? []).map((m) => [m.id, m.tier]));
  const ids = llm.adapter ? llm.adapter.models.map((m) => m.id) : llm.anthropic ? CLAUDE_MODELS : [];
  const ordered = [def, ...ids.filter((id) => id !== def)];
  return {
    default: def,
    models: ordered.map((id) => {
      if (mine[id]) return { id, tier: mine[id], tierBy: 'voce' as const };
      const fromPlugin = declared.get(id);
      if (fromPlugin) return { id, tier: fromPlugin, tierBy: 'plugin' as const };
      const known = llm.anthropic ? knownTier(id) : undefined;
      return known ? { id, tier: known, tierBy: 'conhecido' as const } : { id };
    }),
  };
}

/** The spec the agent runs with for a conversation: its choice if the provider still has it, else the default. */
export function modelSpecFor(llm: Pick<ActiveLlm, 'model' | 'adapter' | 'anthropic'>, chosen: string | undefined): string {
  if (!chosen) return llm.model;
  const offered = modelChoices(llm, {}).models.some((m) => m.id === chosen);
  if (!offered) return llm.model;
  return llm.anthropic ? `anthropic/${chosen}` : `${ADAPTER_PROVIDER}/${chosen}`;
}

/** How costly each model is, as the developer classified them (settings `model-tiers`). */
export class ModelTiers {
  constructor(private readonly db: DatabaseSync) {}

  all(): Record<string, ModelTier> {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'model-tiers'").get() as { value: string } | undefined;
    try {
      return row ? (JSON.parse(row.value) as Record<string, ModelTier>) : {};
    } catch {
      return {};
    }
  }

  set(model: string, tier: ModelTier | null): Record<string, ModelTier> {
    const next = { ...this.all() };
    if (tier) next[model] = tier;
    else delete next[model];
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('model-tiers', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
    return next;
  }
}
