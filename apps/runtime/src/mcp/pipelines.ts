import type { BrainStore } from '../brain/store.ts';
import type { Pipeline, PipelineStage } from '../brain/domain/pipelines.ts';
import { playbookParams } from '../brain/domain/playbooks.ts';
import { stem, words } from '../brain/domain/similarity.ts';
import type { AgentClient } from './clients.ts';

/**
 * How esteiras look to a coding agent: short, in the words of the screen, and
 * honest about what will wait for the developer.
 */

/** Esteiras matching a query (shared word stems over name, description, stages and procedures). */
export function searchPipelines(all: Pipeline[], query?: string): Pipeline[] {
  const sorted = [...all].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  if (!query?.trim()) return sorted;
  const wanted = new Set(words(query).map(stem));
  const needed = Math.min(2, wanted.size);
  return sorted
    .map((p) => {
      const text = [p.name.replace(/-/g, ' '), p.description, ...p.stages.flatMap((s) => [s.label, ...s.options.map((o) => o.playbook.replace(/-/g, ' '))])].join(' ');
      const have = new Set(words(text).map(stem));
      return { p, shared: [...wanted].filter((w) => have.has(w)).length };
    })
    .filter((r) => r.shared >= needed)
    .sort((a, b) => b.shared - a.shared)
    .map((r) => r.p);
}

const inputLine = (p: Pipeline) =>
  p.inputs.map((i) => ({ name: i.name, description: i.description, ...(i.options?.length ? { options: i.options } : {}), ...(i.default ? { default: i.default } : {}) }));

export function pipelineSummary(p: Pipeline) {
  return {
    name: p.name,
    description: p.description,
    inputs: inputLine(p),
    stages: p.stages.map((s) => ({ id: s.id, label: s.label })),
    uses: p.uses,
  };
}

/** Where the passage into a stage stands for this agent. */
function passageFor(stage: PipelineStage, client: AgentClient): string {
  if (stage.passage === 'auto') return 'segue sozinha';
  return client.canSkipPassages ? 'pergunta ao desenvolvedor; você pode pular com um destino' : 'espera o desenvolvedor autorizar';
}

export function pipelineDetail(p: Pipeline, brain: BrainStore, client: AgentClient) {
  const gaps = brain.pipelineGaps(p);
  return {
    name: p.name,
    description: p.description,
    inputs: inputLine(p),
    stages: p.stages.map((s, i) => ({
      id: s.id,
      label: s.label,
      ...(i > 0 ? { passage: passageFor(s, client) } : {}),
      runs: s.options.map((o) => {
        const pb = brain.playbook(o.playbook);
        return {
          procedure: o.playbook,
          ...(o.when ? { when: `${o.when.field} = ${o.when.equals}` } : {}),
          receives: pb ? playbookParams(pb).map((param) => (o.map?.[param] ? `${param} ← ${o.map[param]}` : param)) : [],
          delivers: pb ? pb.outputs.map((out) => out.name) : [],
        };
      }),
    })),
    asks_developer: gaps.map((g) => `${g.param} (${g.playbook})`),
    hint: client.canRunPipelines
      ? 'Rode com orbi_run_pipeline {name, inputs, destination?}. destination é o id da etapa onde parar.'
      : 'Rodar esteiras está desligado para você: o desenvolvedor liga em Agentes › Conexões.',
  };
}
