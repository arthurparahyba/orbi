/**
 * What changed in a learning card during its conversation (docs/funcionalidades/21): the current
 * proposal against the one before, item by item and, in procedures, step by step. No versions on
 * screen: the card shows these lines in green, "Mudou na conversa".
 */
type Item = { kind: string; payload: Record<string, unknown> };
export interface LearningChange { where: string; text: string }

const itemsOf = (detail: string): Item[] => {
  try { return ((JSON.parse(detail) as { items?: Item[] }).items ?? []).filter((i) => i && typeof i.kind === 'string'); }
  catch { return []; }
};
const keyOf = (i: Item) => `${i.kind}:${String(i.payload.name ?? i.payload.id ?? `${i.payload.from}-${i.payload.rel}-${i.payload.to}`)}`;
const nameOf = (i: Item) => String(i.payload.name ?? i.payload.id ?? `${i.payload.from} ${i.payload.rel} ${i.payload.to}`);
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const KIND: Record<string, string> = { playbook: 'Procedimento', pipeline: 'Esteira', type: 'Conceito', entity: 'Fato', edge: 'Relação', concept: 'Conceito' };

type Step = { id?: string; label?: string; how?: string };
/** Field names in words; anything not listed shows as is. */
const FIELD: Record<string, string> = {
  description: 'descrição', trigger: 'quando usar', instructions: 'instruções', intent: 'intenção', props: 'propriedades',
  relations: 'relações', requires: 'exige', knows: 'como achar', inputs: 'entradas', outputs: 'entrega', autonomy: 'autonomia',
  appliesTo: 'vale para', variationOf: 'variação de', aliases: 'outros nomes', type: 'tipo', scripts: 'scripts', stages: 'etapas',
};

export function learningChanges(before: string, after: string): LearningChange[] {
  const old = new Map(itemsOf(before).map((i) => [keyOf(i), i]));
  const out: LearningChange[] = [];
  for (const cur of itemsOf(after)) {
    const prev = old.get(keyOf(cur));
    const label = `${KIND[cur.kind] ?? cur.kind} ${nameOf(cur)}`;
    if (!prev) { out.push({ where: `${label} (novo)`, text: show(cur.payload.description ?? cur.payload.intent ?? '') }); continue; }
    if (cur.kind === 'playbook') {
      const steps = (cur.payload.steps ?? []) as Step[];
      const before = new Map(((prev.payload.steps ?? []) as Step[]).map((s, n) => [s.id ?? `#${n}`, s]));
      steps.forEach((s, n) => {
        const p = before.get(s.id ?? `#${n}`);
        if (!p) out.push({ where: `Passo ${n + 1}: ${s.label ?? ''} (novo)`, text: s.how ?? '' });
        else if (p.how !== s.how || p.label !== s.label) out.push({ where: `Passo ${n + 1}: ${s.label ?? ''}`, text: s.how ?? '' });
      });
      for (const [id, s] of before) if (!steps.some((x, n) => (x.id ?? `#${n}`) === id)) out.push({ where: `Passo saiu: ${s.label ?? id}`, text: '' });
    }
    for (const [field, value] of Object.entries(cur.payload)) {
      if (field === 'steps' || field === 'name' || field === 'id') continue;
      if (JSON.stringify(prev.payload[field]) !== JSON.stringify(value)) out.push({ where: `${label} · ${FIELD[field] ?? field}`, text: show(value) });
    }
  }
  return out;
}

/**
 * What a proposed fact does to the brain (docs/funcionalidades/22), for the card: new, nothing
 * new, or what it adds and changes in the fact that exists (learning adds, it does not replace).
 */
export function factEffect(existing: { props: Record<string, unknown> } | undefined, props: Record<string, unknown> | undefined): string {
  if (!existing) return 'novo';
  const out: string[] = [];
  for (const [k, v] of Object.entries(props ?? {})) {
    if (!(k in existing.props)) out.push(`acrescenta ${k} = ${show(v)}`);
    else if (JSON.stringify(existing.props[k]) !== JSON.stringify(v)) out.push(`muda ${k}: ${show(existing.props[k])} → ${show(v)}`);
  }
  return out.length ? out.join(' · ') : 'já sei';
}
