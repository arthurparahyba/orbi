import type { DatabaseSync } from 'node:sqlite';
import type { ModelTier } from '@orbi/plugin-sdk';
import type { ActiveLlm } from './index.ts';
import { modelChoices, modelSpecFor } from './choices.ts';

/**
 * A model for each kind of work (docs/funcionalidades/12): talking and running a procedure can be
 * cheap; learning and correcting a procedure deserves a better model; the knowledge reviewer runs
 * on the cheapest. The runtime picks the kind for every turn, so the developer never has to switch.
 * A model chosen in a conversation is for that conversation (talking and running); learning and
 * correcting always use what is set here.
 */
export type ModelRole = 'conversa' | 'executar' | 'aprender' | 'conhecimento';
export const MODEL_ROLES: readonly ModelRole[] = ['conversa', 'executar', 'aprender', 'conhecimento'];

type Llm = Pick<ActiveLlm, 'model' | 'adapter' | 'anthropic'>;

/** The roles the developer set (settings `model-roles`); a role left out uses its default. */
export class ModelRoles {
  constructor(private readonly db: DatabaseSync) {}

  all(): Partial<Record<ModelRole, string>> {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'model-roles'").get() as { value: string } | undefined;
    try {
      return row ? (JSON.parse(row.value) as Partial<Record<ModelRole, string>>) : {};
    } catch {
      return {};
    }
  }

  set(role: ModelRole, model: string | null): Partial<Record<ModelRole, string>> {
    const next = { ...this.all() };
    if (model) next[role] = model;
    else delete next[role];
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('model-roles', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
    return next;
  }
}

/** What each role runs with now, and whether the developer set it (else the default it falls back to). */
export function resolveRoles(llm: Llm, set: Partial<Record<ModelRole, string>>, tiers: Record<string, ModelTier>): Record<ModelRole, { model: string; set: boolean }> {
  const choices = modelChoices(llm, tiers);
  const offered = (id?: string) => (id && choices.models.some((m) => m.id === id) ? id : undefined);
  const cheapest = choices.models.find((m) => m.tier === 'cheap')?.id;
  const pick = (role: ModelRole, fallback: string) => {
    const own = offered(set[role]);
    return { model: own ?? fallback, set: !!own };
  };
  return {
    conversa: pick('conversa', choices.default),
    executar: pick('executar', choices.default),
    aprender: pick('aprender', choices.default),
    conhecimento: pick('conhecimento', cheapest ?? choices.default),
  };
}

/**
 * The kind of work of a turn: correcting (the review asks for a change), learning (a rehearsal is
 * open), running (a procedure is open) or talking.
 */
export function turnRole(t: { openRun?: { kind?: string } | null; reviewAsksChange: boolean }): Exclude<ModelRole, 'conhecimento'> {
  if (t.reviewAsksChange) return 'aprender';
  if (t.openRun?.kind === 'rehearsal') return 'aprender';
  if (t.openRun) return 'executar';
  return 'conversa';
}

/** The model spec for a turn: the conversation's own choice for talking and running, the role's otherwise. */
export function modelForTurn(llm: Llm, roles: Record<ModelRole, { model: string }>, role: ModelRole, conversationChoice?: string): string {
  const own = role === 'conversa' || role === 'executar' ? conversationChoice : undefined;
  return modelSpecFor(llm, own ?? roles[role].model);
}
