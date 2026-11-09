import { defineTool, useTool } from '@flue/runtime';
import * as v from 'valibot';
import { services } from '../../services.ts';
import type { AgentContext } from '../context.ts';

/** Memory: query the brain freely; learning goes through the gate (the developer approves). */

export const brainQuery = defineTool({
  name: 'brain_query',
  description:
    'Look up the brain (knowledge graph). Give `id` to get one entity with its current relations and neighborhood, `type` to list entities of a type, or `text` to search. Use before acting: what you were taught is here.',
  input: v.object({
    id: v.optional(v.string()),
    type: v.optional(v.string()),
    text: v.optional(v.string()),
    depth: v.optional(v.number()),
  }),
  async run({ data }) {
    const { brain } = services();
    const json = (value: unknown) => JSON.parse(JSON.stringify(value));
    if (data.id) {
      const entity = brain.get(data.id);
      if (!entity) return { output: { notFound: data.id, similar: brain.search(data.id, 5).map((e) => e.id) } };
      return { output: json({ entity, relations: brain.neighbors(data.id), nearby: brain.reachable(data.id, data.depth ?? 2) }) };
    }
    if (data.type) return { output: json(brain.byType(data.type)) };
    if (data.text) return { output: json(brain.search(data.text)) };
    return { output: json({ ontology: brain.types(), gaps: brain.gaps(), playbooks: brain.playbooks().map((p) => p.name) }) };
  },
});

const learnItem = v.variant('kind', [
  v.object({ kind: v.literal('type'), payload: v.object({ name: v.string(), description: v.string(), relations: v.optional(v.record(v.string(), v.string())), requires: v.optional(v.array(v.string())) }) }),
  v.object({ kind: v.literal('entity'), payload: v.object({ id: v.string(), type: v.string(), props: v.optional(v.record(v.string(), v.unknown())), body: v.optional(v.string()) }) }),
  v.object({ kind: v.literal('edge'), payload: v.object({ from: v.string(), rel: v.string(), to: v.string(), attrs: v.optional(v.record(v.string(), v.unknown())), validFrom: v.optional(v.string()), validTo: v.optional(v.string()) }) }),
  v.object({
    kind: v.literal('playbook'),
    payload: v.object({
      name: v.pipe(v.string(), v.description('kebab-case')),
      description: v.pipe(v.string(), v.description('When to use it — this line decides when it is picked')),
      appliesTo: v.optional(v.string()),
      trigger: v.string(),
      autonomy: v.optional(v.picklist(['observe', 'ask', 'auto'])),
      steps: v.array(v.object({ id: v.string(), label: v.string(), how: v.string() })),
      instructions: v.string(),
      variationOf: v.optional(v.pipe(v.string(), v.description('Name of the playbook this one was made from (a variation); keep the ids of reused steps'))),
      outputs: v.optional(
        v.pipe(
          v.array(v.object({ name: v.string(), description: v.string() })),
          v.description('What it hands over when it finishes (snake_case names, e.g. versao, pr_url): the next stage of an esteira uses them'),
        ),
      ),
      scripts: v.optional(
        v.pipe(
          v.array(v.object({ name: v.string(), description: v.string(), code: v.string(), effect: v.optional(v.picklist(['local', 'publica'])) })),
          v.description('Its own Python scripts (name like gerar_html.py), run with run_script and reading data from sys.argv. The complete list: scripts left out are removed. Leave the field out to keep the current ones.'),
        ),
      ),
    }),
  }),
  v.object({
    kind: v.literal('pipeline'),
    payload: v.object({
      name: v.pipe(v.string(), v.description('kebab-case')),
      description: v.string(),
      inputs: v.pipe(
        v.array(v.object({ name: v.string(), description: v.string(), options: v.optional(v.array(v.string())), default: v.optional(v.string()) })),
        v.description('What it needs to start; `options` when a branch depends on it (e.g. tipo: front/backend); `default` when the developer gave a usual value (a folder, a branch): then it starts without asking'),
      ),
      stages: v.pipe(
        v.array(
          v.object({
            id: v.pipe(v.string(), v.description('kebab-case, short: dev, hml, gmud')),
            label: v.string(),
            passage: v.pipe(v.picklist(['ask', 'auto']), v.description('Coming into this stage: ask the developer, or go on by itself')),
            options: v.array(
              v.object({
                playbook: v.string(),
                when: v.optional(v.object({ field: v.string(), equals: v.string() })),
                map: v.optional(
                  v.pipe(
                    v.record(v.string(), v.string()),
                    v.description('Only when names differ: param ← "entrada.<input>", "<stage>.<output>" or "perguntar"'),
                  ),
                ),
              }),
            ),
          }),
        ),
        v.description('In order. A stage with branches has one option per branch, each with `when`.'),
      ),
    }),
  }),
]);

/** Types first, then what uses them: an entity can be of a type proposed in the same batch. */
const ORDER = { type: 0, entity: 1, edge: 2, playbook: 3, pipeline: 4 } as const;
export const inLearningOrder = <T extends { kind: keyof typeof ORDER }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

/**
 * The learning card's heading: a fix to procedures that already exist reads as one
 * ("Corrigir 2 procedimentos: a, b"); anything else as "Aprender: <reason>".
 */
export function learnTitle(items: Array<{ kind: string; payload: { name?: string } }>, reason: string, exists: (playbook: string) => boolean): string {
  const fixes = items.filter((i) => i.kind === 'playbook' && i.payload.name && exists(i.payload.name)).map((i) => i.payload.name!);
  const pipelines = items.filter((i) => i.kind === 'pipeline').map((i) => i.payload.name ?? '');
  if (fixes.length && fixes.length + pipelines.length === items.length) {
    const what = [fixes.length === 1 ? `o procedimento ${fixes[0]}` : `${fixes.length} procedimentos: ${fixes.join(', ')}`, ...pipelines.map((n) => `a esteira ${n}`)];
    return `Corrigir ${what.join(' e ')}`;
  }
  return `Aprender: ${reason}`;
}

export function useBrain(ctx: AgentContext) {
  const { brain } = services();
  useTool(brainQuery);
  ctx.gated({
    name: 'brain_learn',
    description:
      'Save what you learned: new ontology types, entities, relations (with optional validity dates), playbooks (procedures with steps) and esteiras (playbooks in sequence, `pipeline`). ' +
      'The brain starts empty: when an entity needs a type that does not exist yet, include that `type` in the same batch — never drop the entity because its type is missing. ' +
      'Save the things the procedure touches (account, repository, portal, environment) as entities, not only the playbook. ' +
      'The batch is checked first (problems come back at once, nothing is asked); then shown to the developer to approve, and saved all or nothing.',
    input: v.object({ reason: v.string(), items: v.array(learnItem) }),
    category: () => 'aprender',
    summary: (a) => learnTitle(a.items as Array<{ kind: string; payload: { name?: string } }>, a.reason, (name) => !!brain.playbook(name)),
    precheck: (a) => {
      const problems = brain.learnProblems(inLearningOrder(a.items) as never);
      return problems.length ? [...problems, 'Se falta um tipo, inclua o item `type` no mesmo lote; não tire a entidade.'] : [];
    },
    execute: async (a) => {
      const applied = brain.learn(inLearningOrder(a.items) as never, a.reason, ctx.conversationId);
      return `Guardado no cérebro: ${applied.join('; ')}`;
    },
  });
}
