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

/** A piece of a merged text: the same in both, added, or removed. */
export interface DiffPiece { kind: 'same' | 'add' | 'del'; text: string }

// Words, spaces, and punctuation that ends a word ("consulta." → "consulta" + "."), so a sentence that only lost its end shows just that.
const tokens = (s: string) => s.match(/\s+|[.,;:!?)]+(?=\s|$)|[^\s]+?(?=[.,;:!?)]+(?:\s|$)|\s|$)/g) ?? [];

/**
 * The two texts merged word by word, as a code review shows them: what stays, what is added and
 * what goes. Longest common subsequence over words (spaces kept), then neighbours of a kind joined.
 */
export function wordDiff(before: string, after: string): DiffPiece[] {
  const a = tokens(before);
  const b = tokens(after);
  // Common start and end first: most corrections touch a part of the text.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const A = a.slice(start, a.length - end);
  const B = b.slice(start, b.length - end);
  const n = A.length;
  const m = B.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffPiece[] = [];
  const push = (kind: DiffPiece['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  if (start) push('same', a.slice(0, start).join(''));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('del', A[i++]);
    else push('add', B[j++]);
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('add', B[j++]);
  if (end) push('same', a.slice(a.length - end).join(''));
  // A lone space between two changes reads as part of the change.
  return out.filter((p, k) => !(p.kind === 'same' && /^\s+$/.test(p.text) && out[k - 1] && out[k + 1] && out[k - 1].kind !== 'same' && out[k + 1].kind !== 'same' && (out[k - 1].text += p.text, true)));
}

/**
 * Long stretches that did not change, cut to a few words on each side of a change ("…"): the
 * card shows what changes, with just enough around it to read.
 */
export function trimSame(pieces: DiffPiece[], keep = 8): DiffPiece[] {
  return pieces.map((p, k) => {
    if (p.kind !== 'same') return p;
    const words = tokens(p.text);
    const limit = keep * 2;
    const first = k === 0;
    const last = k === pieces.length - 1;
    const room = first || last ? limit : limit * 2;
    if (words.length <= room + 2) return p;
    if (first) return { kind: 'same', text: `…${words.slice(-limit).join('')}` };
    if (last) return { kind: 'same', text: `${words.slice(0, limit).join('')}…` };
    return { kind: 'same', text: `${words.slice(0, limit).join('')} … ${words.slice(-limit).join('')}` };
  });
}

/** How much of the text a change rewrites (0 to 1): above about two thirds, a merged view helps little. */
export function rewritten(pieces: DiffPiece[]): number {
  const total = pieces.reduce((n, p) => n + (p.kind === 'del' ? 0 : p.text.length), 0) || 1;
  return pieces.reduce((n, p) => n + (p.kind === 'add' ? p.text.length : 0), 0) / total;
}

/** Separate places where the text changes (a run of additions and removals counts once). */
export function changeIslands(pieces: DiffPiece[]): number {
  let n = 0;
  let inChange = false;
  for (const p of pieces) {
    const changed = p.kind !== 'same' && p.text.trim() !== '';
    if (changed && !inChange) n++;
    if (p.kind === 'same' && p.text.trim() !== '') inChange = false;
    else if (changed) inChange = true;
  }
  return n;
}

/**
 * How a change reads best. A few words in up to three places: merged in the line, red out and
 * green in. Anything bigger is a rewrite: the text before (red) above the text after (green),
 * each whole, because red and green mixed word by word cannot be read.
 */
export function diffLayout(pieces: DiffPiece[]): 'inline' | 'stacked' {
  return rewritten(pieces) <= 0.3 && changeIslands(pieces) <= 3 ? 'inline' : 'stacked';
}
