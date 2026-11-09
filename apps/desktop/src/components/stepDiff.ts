/** How a learned playbook's steps compare with the playbook it came from. */
export interface Step { id: string; label: string; how?: string }
export type StepChange = 'same' | 'changed' | 'new' | 'removed';
export interface DiffedStep { step: Step; change: StepChange; before?: Step }

/**
 * Steps are matched by `id` (Orbi keeps the id of a step it reused): the same
 * id and text is `same`, the same id with another label or how is `changed`,
 * a new id is `new`. Base steps that are gone come back as `removed`, right
 * after the step that came before them in the base.
 */
export function stepDiff(base: Step[], next: Step[]): DiffedStep[] {
  const byId = new Map(base.map((s) => [s.id, s]));
  const out: DiffedStep[] = next.map((step) => {
    const before = byId.get(step.id);
    if (!before) return { step, change: 'new' };
    const same = before.label === step.label && (before.how ?? '') === (step.how ?? '');
    return same ? { step, change: 'same' } : { step, change: 'changed', before };
  });
  const kept = new Set(next.map((s) => s.id));
  base.forEach((step, i) => {
    if (kept.has(step.id)) return;
    // After the nearest earlier base step that is still in the list.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((d) => d.step.id === base[j].id);
      if (idx >= 0) { at = idx + 1; break; }
    }
    out.splice(at, 0, { step, change: 'removed' });
  });
  return out;
}

export const CHANGE_LABEL: Record<StepChange, string> = { same: 'igual', changed: 'muda', new: 'novo', removed: 'sai' };

/** A procedure's scripts against the base: matched by name, changed when the code or effect differs. */
export interface Script { name: string; description?: string; code: string; effect?: string }
export interface DiffedScript { script: Script; change: StepChange }
export function scriptDiff(base: Script[] | undefined, next: Script[] | undefined, hasBase: boolean): DiffedScript[] {
  const byName = new Map((base ?? []).map((s) => [s.name, s]));
  // Left out of the proposal: the base keeps its scripts.
  if (next === undefined) return (base ?? []).map((script) => ({ script, change: 'same' }));
  const out: DiffedScript[] = next.map((script) => {
    const before = byName.get(script.name);
    if (!before) return { script, change: hasBase ? 'new' : 'same' };
    return { script, change: before.code === script.code && (before.effect ?? 'local') === (script.effect ?? 'local') ? 'same' : 'changed' };
  });
  const kept = new Set(next.map((s) => s.name));
  for (const script of base ?? []) if (!kept.has(script.name)) out.push({ script, change: 'removed' });
  return out;
}

/** A field of the procedure that a correction changes, as it is today and as it will be. */
export interface FieldChange { label: string; before: string; after: string }
interface ProcedureLike {
  description?: string; trigger?: string; instructions?: string; appliesTo?: string | null;
  outputs?: Array<{ name: string }>; steps?: Step[];
}

/**
 * What a correction of an existing procedure changes, and only that: the fields that differ
 * (a field left out of the proposal keeps its value), the steps that change, come or go,
 * and the steps that stay the same (shown folded).
 */
export function correctionView(base: ProcedureLike, next: ProcedureLike): { fields: FieldChange[]; steps: DiffedStep[]; same: Step[] } {
  const fields: FieldChange[] = [];
  const text = (v: unknown) => String(v ?? '').trim();
  const field = (label: string, a: unknown, b: unknown) => {
    if (b === undefined) return;
    if (text(a) !== text(b)) fields.push({ label, before: text(a) || '(vazio)', after: text(b) || '(vazio)' });
  };
  field('Descrição', base.description, next.description);
  field('Quando roda', base.trigger, next.trigger);
  field('Vale para', base.appliesTo, next.appliesTo);
  field('Instruções', base.instructions, next.instructions);
  if (next.outputs !== undefined) field('Entrega', (base.outputs ?? []).map((o) => o.name).join(', '), next.outputs.map((o) => o.name).join(', '));
  const diffed = stepDiff(base.steps ?? [], next.steps ?? base.steps ?? []);
  return { fields, steps: diffed.filter((d) => d.change !== 'same'), same: diffed.filter((d) => d.change === 'same').map((d) => d.step) };
}
