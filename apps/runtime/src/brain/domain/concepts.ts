import type { Edge, Entity, OntologyType, Playbook, PlaybookParam, ResolvedInput } from './types.ts';
import { DATA_NAME } from './playbooks.ts';

/**
 * Procedures written over concepts (docs/funcionalidades/18): a procedure receives typed
 * inputs (mfe: MicroFrontend) and its steps cite them as {{mfe}} or {{mfe.publicadoPor.endereco}}.
 * Here: which citations are valid against the ontology, which specific facts leaked into the
 * steps, and how a run fills the citations from the facts. No storage.
 */

type TypeOf = (name: string) => OntologyType | undefined;
type ProcedureText = Pick<Playbook, 'steps' | 'instructions'> & { inputs?: PlaybookParam[] };

/**
 * A citation: an input, then relations and a property ({{mfe.publicadoPor.endereco}}), or a
 * relation fanned out with [] and what is known of each one reached ({{ambiente.recursos[].de_pe}}).
 */
const CITE = /\{\{\s*([a-zA-Z_][\w-]*(?:\.[\p{L}\w-]+(?:\[\])?)*)\s*\}\}/gu;

/** Every {{…}} citation in the steps and instructions, without credentials ({{segredo:…}}). */
export function citations(pb: ProcedureText): string[] {
  const text = [pb.instructions, ...pb.steps.map((s) => `${s.label} ${s.how}`)].join('\n');
  return [...new Set([...text.matchAll(CITE)].map((m) => m[1]))];
}

/** Properties every entity has, without declaring them. */
const BUILT_IN = new Set(['id', 'nome']);

/**
 * Problems with a procedure's inputs and citations; empty = valid. Only procedures that declare
 * `inputs` are checked: the older ones keep their free {{parameters}}.
 */
export function inputProblems(pb: ProcedureText, typeOf: TypeOf): string[] {
  const inputs = pb.inputs ?? [];
  if (!inputs.length) return [];
  const problems: string[] = [];
  const byName = new Map<string, PlaybookParam>();
  for (const input of inputs) {
    if (!DATA_NAME.test(input.name ?? '')) problems.push(`entrada com nome inválido: ${input.name} (letras minúsculas, números e _)`);
    else if (byName.has(input.name)) problems.push(`entrada repetida: ${input.name}`);
    if (input.concept && !typeOf(input.concept)) problems.push(`entrada ${input.name}: o conceito ${input.concept} não existe (inclua o tipo no mesmo lote)`);
    byName.set(input.name, input);
  }
  for (const cite of citations(pb)) {
    const [head, ...path] = cite.split('.');
    const input = byName.get(head);
    if (!input) {
      problems.push(`{{${cite}}}: "${head}" não é uma entrada do procedimento (entradas: ${[...byName.keys()].join(', ')})`);
      continue;
    }
    if (!path.length) continue;
    if (!input.concept) {
      problems.push(`{{${cite}}}: a entrada ${head} não tem conceito, então não tem propriedades`);
      continue;
    }
    const problem = pathProblem(input.concept, path, typeOf);
    if (problem) problems.push(`{{${cite}}}: ${problem}`);
  }
  return problems;
}

/** Walks a citation's path over the ontology: relations lead to the next type, a property ends it. */
function pathProblem(concept: string, path: string[], typeOf: TypeOf): string | null {
  let type = typeOf(concept);
  for (let i = 0; i < path.length; i++) {
    const fan = path[i].endsWith('[]');
    const segment = fan ? path[i].slice(0, -2) : path[i];
    if (!type) return null;
    if (fan) {
      // {{x.rel[].saber}}: the relation fans out; what comes after is what is known of each one reached.
      if (!type.relations[segment]) return `"${segment}" não é ligação de ${type.name}: só uma ligação pode ter []`;
      if (path.length - i !== 2) return `depois de "${segment}[]" vem só o nome do saber (ex.: ${segment}[].de_pe)`;
      return null;
    }
    const target = type.relations[segment];
    if (target) {
      if (target === '*') return null;
      type = typeOf(target);
      continue;
    }
    const isLast = i === path.length - 1;
    if (BUILT_IN.has(segment) || type.props?.[segment] !== undefined) {
      return isLast ? null : `"${segment}" é propriedade de ${type.name}, não leva a outro conceito`;
    }
    return `"${segment}" não é propriedade nem ligação de ${type.name} (declare em props do tipo, ou a ligação em relations)`;
  }
  return null;
}

/**
 * Specific facts written into a procedure that declares inputs: the id or another name of an
 * entity of an input's concept, literal in a step ("checkout-mfe" instead of {{mfe}}).
 */
export function leakedSpecifics(pb: ProcedureText & Pick<Playbook, 'appliesTo'>, entitiesOf: (type: string) => Entity[]): string[] {
  const inputs = pb.inputs ?? [];
  if (!inputs.length) return [];
  const concepts = new Set(inputs.map((i) => i.concept).filter((c): c is string => !!c));
  if (pb.appliesTo && /^[A-Z]/.test(pb.appliesTo)) concepts.add(pb.appliesTo);
  const text = [pb.instructions, ...pb.steps.map((s) => `${s.label} ${s.how}`)].join('\n').replace(/\{\{[^}]*\}\}/g, ' ');
  const found: string[] = [];
  for (const concept of concepts) {
    for (const entity of entitiesOf(concept)) {
      for (const name of [entity.id, ...(entity.aliases ?? [])]) {
        if (name.length < 3) continue;
        const re = new RegExp(`(^|[^\\p{L}\\p{N}_-])${escapeRe(name)}($|[^\\p{L}\\p{N}_-])`, 'iu');
        if (re.test(text)) {
          found.push(`"${name}" (${concept} ${entity.id}) está escrito no procedimento: é fato ou entrada? Use a entrada do conceito ${concept} em vez do nome`);
          break;
        }
      }
    }
  }
  return found;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What a run needs to know about the facts to fill citations. */
export interface FactLookup {
  typeOf: TypeOf;
  entity(id: string): Entity | undefined;
  named(type: string, name: string): Entity[];
  out(id: string): Edge[];
}

/** Inputs given by name: those found among the facts (by id or another name), and the rest. */
export function resolveInputs(
  inputs: PlaybookParam[],
  params: Record<string, string>,
  facts: Pick<FactLookup, 'named'>,
  already: Record<string, ResolvedInput> = {},
): { resolved: Record<string, ResolvedInput>; pending: Array<{ input: PlaybookParam; value: string; candidates: string[] }> } {
  const resolved: Record<string, ResolvedInput> = { ...already };
  const pending: Array<{ input: PlaybookParam; value: string; candidates: string[] }> = [];
  for (const input of inputs) {
    if (!input.concept || resolved[input.name]) continue;
    const value = params[input.name];
    if (value === undefined || value === '') continue;
    const matches = facts.named(input.concept, value);
    if (matches.length === 1) resolved[input.name] = { value, entity: matches[0].id, learned: 'known' };
    else pending.push({ input, value, candidates: matches.map((m) => m.id) });
  }
  return { resolved, pending };
}

/**
 * The value of a citation for a run: {{mfe}} is the fact's id; {{mfe.publicadoPor.endereco}}
 * follows the current relations and ends in a property. Undefined when a link is missing.
 */
export function citationValue(cite: string, params: Record<string, string>, resolved: Record<string, ResolvedInput>, facts: FactLookup): string | undefined {
  if (cite.includes('[]')) {
    const fan = fanOut(cite, resolved, facts);
    return fan && !fan.missing.length ? fan.lines.join('; ') : undefined;
  }
  const [head, ...path] = cite.split('.');
  const res = resolved[head];
  if (!path.length) return res && !res.undone ? res.entity : params[head];
  if (!res || res.undone) return undefined;
  let entity = facts.entity(res.entity);
  for (let i = 0; i < path.length && entity; i++) {
    const segment = path[i];
    const isLast = i === path.length - 1;
    if (isLast) {
      if (segment === 'id') return entity.id;
      if (segment === 'nome') return String(entity.props.nome ?? entity.id);
      const viaEdge = facts.out(entity.id).find((e) => e.rel === segment);
      if (viaEdge) return viaEdge.to;
      const value = entity.props[segment];
      return value === undefined || value === null ? undefined : String(value);
    }
    const edge = facts.out(entity.id).find((e) => e.rel === segment);
    entity = edge ? facts.entity(edge.to) : undefined;
  }
  return undefined;
}

/**
 * {{ambiente.recursos[].de_pe}}: each entity reached by the relation, with what its concept knows
 * by that name. `missing`: the ones whose concept does not know it yet (the run cannot guess).
 */
export function fanOut(cite: string, resolved: Record<string, ResolvedInput>, facts: FactLookup): { lines: string[]; missing: string[] } | undefined {
  const [head, ...path] = cite.split('.');
  const res = resolved[head];
  if (!res || res.undone) return undefined;
  let entity = facts.entity(res.entity);
  let i = 0;
  for (; i < path.length && entity && !path[i].endsWith('[]'); i++) {
    const edge = facts.out(entity.id).find((e) => e.rel === path[i]);
    entity = edge ? facts.entity(edge.to) : undefined;
  }
  if (!entity || i >= path.length - 1) return undefined;
  const rel = path[i].slice(0, -2);
  const saber = path[i + 1];
  const lines: string[] = [];
  const missing: string[] = [];
  for (const edge of facts.out(entity.id).filter((e) => e.rel === rel)) {
    const target = facts.entity(edge.to);
    if (!target) continue;
    const how = facts.typeOf(target.type)?.knows?.[saber];
    if (how) lines.push(`${target.id} (${target.type}): ${how}`);
    else missing.push(`${target.id} (${target.type}) não sabe "${saber}"`);
  }
  return { lines, missing };
}

/** Fills the citations a run can already answer; the others stay as {{…}}, for the model to see what is missing. */
export function fillCitations(text: string, params: Record<string, string>, resolved: Record<string, ResolvedInput>, facts: FactLookup): string {
  return text.replace(CITE, (all, cite: string) => citationValue(cite, params, resolved, facts) ?? all);
}

/** Citations of a run that the facts cannot answer yet ("sei / não sei"). */
export function unanswered(pb: ProcedureText, params: Record<string, string>, resolved: Record<string, ResolvedInput>, facts: FactLookup): string[] {
  return citations(pb).filter((cite) => citationValue(cite, params, resolved, facts) === undefined);
}

/** One line of the "sei / não sei" list before a run. */
export interface ReadinessItem { label: string; known: boolean; detail: string }

/**
 * What a run over concepts needs, checked against the facts before it starts: each input, each
 * citation, and each entity a fan-out reaches. What is not known becomes a question, not a guess.
 */
export function readiness(pb: ProcedureText, params: Record<string, string>, resolved: Record<string, ResolvedInput>, facts: FactLookup): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  for (const input of pb.inputs ?? []) {
    const value = params[input.name];
    const res = resolved[input.name];
    if (value === undefined || value === '') items.push({ label: input.name, known: false, detail: 'não veio no pedido' });
    else if (!input.concept) items.push({ label: input.name, known: true, detail: value });
    else if (res && !res.undone) items.push({ label: `${input.name}: ${value}`, known: true, detail: res.entity === value ? `${input.concept} conhecido` : `${res.entity} (${input.concept})` });
    else items.push({ label: `${input.name}: ${value}`, known: false, detail: `não conheço esse ${input.concept}` });
  }
  for (const cite of citations(pb)) {
    if (!cite.includes('.')) continue;
    if (cite.includes('[]')) {
      const fan = fanOut(cite, resolved, facts);
      if (!fan) {
        items.push({ label: cite, known: false, detail: 'depende de uma entrada que ainda não conheço' });
        continue;
      }
      for (const line of fan.lines) items.push({ label: line.split(':')[0], known: true, detail: line.slice(line.indexOf(':') + 2) });
      for (const line of fan.missing) items.push({ label: line.split(' não sabe')[0], known: false, detail: `não sei ${line.split(' não sabe ')[1]}` });
      continue;
    }
    const value = citationValue(cite, params, resolved, facts);
    items.push(value === undefined ? { label: cite, known: false, detail: 'o cérebro não tem esse dado' } : { label: cite, known: true, detail: value });
  }
  return items;
}
