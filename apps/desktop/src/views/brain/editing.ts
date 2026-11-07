/**
 * Pure helpers behind the Cérebro editors: properties as editable rows and
 * playbook steps as a list you can reorder. No React here, so they are tested
 * on their own (test/editing.test.ts).
 */

export interface PropRow { key: string; value: string }

/** Properties as rows of text; non-text values (lists, numbers) shown as JSON. */
export function rowsFromProps(props: Record<string, unknown>): PropRow[] {
  return Object.entries(props).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) }));
}

/**
 * Rows back to properties. A property that was not text keeps its kind when the
 * new text is valid JSON (a list stays a list); everything else is text. Empty
 * keys are dropped; a repeated key keeps the last row.
 */
export function propsFromRows(rows: PropRow[], original: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key, value } of rows) {
    const k = key.trim();
    if (!k) continue;
    if (k in original && typeof original[k] !== 'string') {
      try {
        out[k] = JSON.parse(value);
        continue;
      } catch {
        /* not JSON anymore: keep as text */
      }
    }
    out[k] = value;
  }
  return out;
}

export interface EditableStep { id: string; label: string; how: string }

/** Same rule as the runtime: a readable id from the name, never one already used. */
export function stepId(label: string, taken: Iterable<string>): string {
  const base = label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'passo';
  const used = new Set(taken);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function moveStep<T>(steps: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** What is wrong before sending (the runtime checks again). Empty = can save. */
export function stepProblems(steps: EditableStep[]): string[] {
  if (steps.length === 0) return ['O procedimento precisa de pelo menos um passo.'];
  return steps.flatMap((s, i) => (s.label.trim() ? [] : [`O passo ${i + 1} está sem nome.`]));
}

/**
 * New steps get an id from their name when saved; existing ones keep theirs,
 * so a step renamed is still "the same step" for history and variations.
 */
export function finalizeSteps(steps: EditableStep[]): EditableStep[] {
  const taken = new Set(steps.map((s) => s.id).filter(Boolean));
  return steps.map((s) => {
    const step = { id: s.id, label: s.label.trim(), how: s.how.trim() };
    if (!step.id) {
      step.id = stepId(step.label, taken);
      taken.add(step.id);
    }
    return step;
  });
}
