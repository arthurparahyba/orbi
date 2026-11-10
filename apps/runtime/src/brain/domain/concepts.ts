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

/** Every {{…}} citation in the steps and instructions, without credentials ({{segredo:…}}). */
export function citations(pb: ProcedureText): string[] {
  const text = [pb.instructions, ...pb.steps.map((s) => `${s.label} ${s.how}`)].join('\n');
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z_][\w-]*(?:\.[\p{L}\w-]+)*)\s*\}\}/gu)].map((m) => m[1]))];
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
    const segment = path[i];
    if (!type) return null;
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

/** Fills the citations a run can already answer; the others stay as {{…}}, for the model to see what is missing. */
export function fillCitations(text: string, params: Record<string, string>, resolved: Record<string, ResolvedInput>, facts: FactLookup): string {
  return text.replace(/\{\{\s*([a-zA-Z_][\w-]*(?:\.[\p{L}\w-]+)*)\s*\}\}/gu, (all, cite: string) => citationValue(cite, params, resolved, facts) ?? all);
}

/** Citations of a run that the facts cannot answer yet ("sei / não sei"). */
export function unanswered(pb: ProcedureText, params: Record<string, string>, resolved: Record<string, ResolvedInput>, facts: FactLookup): string[] {
  return citations(pb).filter((cite) => citationValue(cite, params, resolved, facts) === undefined);
}
