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
    }),
  }),
]);

/** Types first, then what uses them: an entity can be of a type proposed in the same batch. */
const ORDER = { type: 0, entity: 1, edge: 2, playbook: 3 } as const;
export const inLearningOrder = <T extends { kind: keyof typeof ORDER }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

export function useBrain(ctx: AgentContext) {
  const { brain } = services();
  useTool(brainQuery);
  ctx.gated({
    name: 'brain_learn',
    description:
      'Save what you learned: new ontology types, entities, relations (with optional validity dates) and playbooks (procedures with steps). ' +
      'The brain starts empty: when an entity needs a type that does not exist yet, include that `type` in the same batch. ' +
      'The batch is validated against the ontology and shown to the developer to approve.',
    input: v.object({ reason: v.string(), items: v.array(learnItem) }),
    category: () => 'aprender',
    summary: (a) => `Aprender: ${a.reason}`,
    execute: async (a) => {
      const applied = inLearningOrder(a.items).map((item) => brain.apply(brain.propose(item.kind, item.payload as Record<string, unknown>, a.reason, ctx.conversationId).id));
      return `Guardado no cérebro: ${applied.join('; ')}`;
    },
  });
}
