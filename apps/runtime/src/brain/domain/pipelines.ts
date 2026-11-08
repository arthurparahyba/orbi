import { DATA_NAME } from './playbooks.ts';
import type { Playbook } from './types.ts';

/**
 * Esteiras: procedures in sequence, each stage handing data to the next. Pure
 * rules: what a valid esteira is, which branch a stage takes, where each
 * parameter comes from, and when a passage may go on without asking.
 */

/** What the esteira needs to start (e.g. repo; tipo with options front/backend). */
export interface PipelineInput {
  name: string;
  description: string;
  /** Allowed values, when it picks a branch. */
  options?: string[];
  /** Used when the request does not say: the Orbi starts without asking. */
  default?: string;
}

/** One way to run a stage. With several, `when` picks the branch. */
export interface PipelineOption {
  playbook: string;
  when?: { field: string; equals: string };
  /**
   * Where a parameter comes from when the name differs: "entrada.<input>",
   * "<stage>.<output>" or "perguntar". Unlisted parameters are matched by name.
   */
  map?: Record<string, string>;
}

export interface PipelineStage {
  id: string;
  label: string;
  options: PipelineOption[];
  /** Coming into this stage from the previous one: ask the developer, or go on. */
  passage: 'ask' | 'auto';
}

export interface Pipeline {
  name: string;
  description: string;
  inputs: PipelineInput[];
  stages: PipelineStage[];
  uses: number;
  updatedAt: string;
}

export type PipelineInputDef = Omit<Pipeline, 'uses' | 'updatedAt'>;

const NAME = /^[a-z0-9][a-z0-9-]{1,63}$/;
const STAGE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const ASK = 'perguntar';

/** Data available while the esteira runs: what it started with and what each stage handed over. */
export interface PipelineData {
  inputs: Record<string, string>;
  stages: Record<string, Record<string, string>>;
}

/** Names a stage can hand over: what any of its options declares. */
function stageOutputs(stage: PipelineStage, playbook: (name: string) => Playbook | undefined): Set<string> {
  return new Set(stage.options.flatMap((o) => playbook(o.playbook)?.outputs.map((x) => x.name) ?? []));
}

export function pipelineProblems(p: PipelineInputDef, playbook: (name: string) => Playbook | undefined): string[] {
  const problems: string[] = [];
  if (!NAME.test(p.name ?? '')) problems.push(`nome de esteira inválido: ${p.name} (kebab-case)`);
  const inputs = new Set<string>();
  for (const i of p.inputs ?? []) {
    if (!DATA_NAME.test(i.name ?? '')) problems.push(`entrada inválida: ${i.name} (letras minúsculas, números e _)`);
    else if (inputs.has(i.name)) problems.push(`entrada repetida: ${i.name}`);
    if (i.default !== undefined && i.default !== '' && i.options?.length && !i.options.includes(i.default)) problems.push(`padrão de ${i.name} deve ser ${i.options.join(' ou ')}`);
    inputs.add(i.name);
  }
  if (!Array.isArray(p.stages) || p.stages.length === 0) return [...problems, 'a esteira precisa de pelo menos uma etapa'];
  const seen = new Map<string, Set<string>>();
  // Fields a branch can look at: inputs and what earlier stages hand over.
  const known = new Set(inputs);
  p.stages.forEach((stage, i) => {
    const where = `etapa ${i + 1}`;
    if (!STAGE_ID.test(stage.id ?? '')) problems.push(`${where}: id inválido "${stage.id}"`);
    else if (seen.has(stage.id)) problems.push(`${where}: id repetido "${stage.id}"`);
    if (!stage.label?.trim()) problems.push(`${where}: sem nome`);
    if (stage.passage !== 'ask' && stage.passage !== 'auto') problems.push(`${where}: passagem deve ser ask ou auto`);
    if (!Array.isArray(stage.options) || stage.options.length === 0) {
      problems.push(`${where}: sem procedimento`);
      return;
    }
    for (const o of stage.options) {
      const pb = playbook(o.playbook);
      if (!pb) problems.push(`${where}: procedimento não existe: ${o.playbook}`);
      if (stage.options.length > 1 && !o.when) problems.push(`${where}: com mais de um procedimento, cada um precisa de uma condição (quando)`);
      if (o.when && !known.has(o.when.field)) problems.push(`${where}: a condição usa "${o.when.field}", que não é entrada nem vem de etapa anterior`);
      for (const [param, source] of Object.entries(o.map ?? {})) {
        const problem = sourceProblem(source, inputs, seen);
        if (problem) problems.push(`${where}: ${param} ← ${problem}`);
      }
    }
    const outs = stageOutputs(stage, playbook);
    seen.set(stage.id, outs);
    for (const o of outs) known.add(o);
  });
  return problems;
}

function sourceProblem(source: string, inputs: Set<string>, earlier: Map<string, Set<string>>): string | undefined {
  if (source === ASK) return undefined;
  const [from, field] = source.split('.');
  if (!field) return `origem inválida "${source}" (use entrada.nome, etapa.dado ou perguntar)`;
  if (from === 'entrada') return inputs.has(field) ? undefined : `a esteira não tem a entrada ${field}`;
  const outs = earlier.get(from);
  if (!outs) return `"${from}" não é uma etapa anterior`;
  return outs.has(field) ? undefined : `a etapa ${from} não entrega ${field}`;
}

/** Which option a stage runs, given the data so far. */
export function chooseOption(stage: PipelineStage, data: PipelineData): PipelineOption {
  const value = (field: string) => data.inputs[field] ?? latest(data, field);
  const match = stage.options.find((o) => !o.when || value(o.when.field) === o.when.equals);
  if (!match) {
    const fields = [...new Set(stage.options.map((o) => o.when?.field).filter(Boolean))];
    throw new Error(`nenhum caminho da etapa ${stage.label} serve para ${fields.map((f) => `${f}=${value(f!) ?? '(vazio)'}`).join(', ')}`);
  }
  return match;
}

/** The value the latest stage that handed over `field` gave. */
function latest(data: PipelineData, field: string): string | undefined {
  let found: string | undefined;
  for (const outputs of Object.values(data.stages)) if (field in outputs) found = outputs[field];
  return found;
}

/**
 * The parameters for a stage's procedure: by the option's map, else by name
 * (inputs, then the latest stage that handed it over). What has no source
 * comes back in `missing`, and the developer is asked.
 */
export function resolveParams(option: PipelineOption, params: string[], data: PipelineData): { params: Record<string, string>; missing: string[]; from: Record<string, string> } {
  const out: Record<string, string> = {};
  const from: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of params) {
    const source = option.map?.[name];
    let value: string | undefined;
    let origin = '';
    if (source && source !== ASK) {
      const [stage, field] = source.split('.');
      value = stage === 'entrada' ? data.inputs[field] : data.stages[stage]?.[field];
      origin = source;
    } else if (!source) {
      if (name in data.inputs) {
        value = data.inputs[name];
        origin = `entrada.${name}`;
      } else {
        for (const [stage, outputs] of Object.entries(data.stages)) {
          if (name in outputs) {
            value = outputs[name];
            origin = `${stage}.${name}`;
          }
        }
      }
    }
    if (value === undefined || value === '') missing.push(name);
    else {
      out[name] = value;
      from[name] = origin;
    }
  }
  return { params: out, missing, from };
}

/** Parameters that will have no value unless someone answers (warnings on the screen, not errors). */
export function pipelineGaps(p: PipelineInputDef, playbook: (name: string) => Playbook | undefined, params: (pb: Playbook) => string[]): Array<{ stage: string; playbook: string; param: string }> {
  const gaps: Array<{ stage: string; playbook: string; param: string }> = [];
  const available = new Set(p.inputs.map((i) => i.name));
  for (const stage of p.stages) {
    for (const o of stage.options) {
      const pb = playbook(o.playbook);
      if (!pb) continue;
      for (const param of params(pb)) {
        const source = o.map?.[param];
        if (source === ASK || (!source && !available.has(param))) gaps.push({ stage: stage.id, playbook: o.playbook, param });
      }
    }
    for (const out of stageOutputs(stage, playbook)) available.add(out);
  }
  return gaps;
}

/** Inputs the esteira needs that were not given, and values outside a field's options. */
/** The inputs given, with each default filled where the request left it out. */
export function withDefaults(p: Pick<Pipeline, 'inputs'>, given: Record<string, string>): Record<string, string> {
  const out = { ...given };
  for (const i of p.inputs) if ((out[i.name] === undefined || out[i.name] === '') && i.default) out[i.name] = i.default;
  return out;
}

export function inputProblems(p: Pick<Pipeline, 'inputs'>, given: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const i of p.inputs) {
    const value = given[i.name];
    if (value === undefined || value === '') problems.push(`falta ${i.name}${i.description ? ` (${i.description})` : ''}${i.options?.length ? `: ${i.options.join(' ou ')}` : ''}`);
    else if (i.options?.length && !i.options.includes(value)) problems.push(`${i.name} deve ser ${i.options.join(' ou ')}, não ${value}`);
  }
  return problems;
}

/**
 * Whether going into stage `next` needs the developer. Going on without asking:
 * the passage says so; the developer gave a destination further on (asking
 * for "até X" is the authorization); or an agent was allowed to skip questions.
 */
export function passageNeedsDeveloper(
  stage: PipelineStage,
  run: { destination: string | null; requestedBy: string; skipQuestions: boolean },
): boolean {
  if (stage.passage === 'auto') return false;
  if (run.requestedBy === 'user' && run.destination) return false;
  if (run.requestedBy !== 'user' && run.skipQuestions) return false;
  return true;
}
