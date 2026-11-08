import { useTool } from '@flue/runtime';
import * as v from 'valibot';
import { services } from '../../services.ts';
import type { AgentContext } from '../context.ts';

/**
 * Esteiras from the conversation: start one the developer asked for ("entrega
 * o portal até a GMUD"), and hand over values the developer gave for a stage.
 * Creating or changing an esteira goes through brain_learn (approval card).
 */
export function usePipelines(ctx: AgentContext) {
  const { brain, pipelines } = services();
  if (brain.pipelines().length === 0) return;

  useTool({
    name: 'pipeline_start',
    description:
      'Start an esteira (procedures in sequence) in this conversation, when the developer asks for a delivery. ' +
      '`destination` is the stage id to stop at when the developer says how far to go ("até a GMUD"); leave it out to go to the end. ' +
      'Inputs with a default can be left out: the default is used, do not ask for them. ' +
      'The engine tells you which procedure to run at each stage and with which data; follow it.',
    input: v.object({
      name: v.string(),
      inputs: v.record(v.string(), v.string()),
      destination: v.optional(v.string()),
    }),
    async run({ data }) {
      try {
        const { run, instruction } = pipelines.engine.start(data.name, data.inputs, { conversationId: ctx.conversationId, destination: data.destination ?? null });
        return { output: { started: run.id, next: instruction } };
      } catch (error) {
        const p = brain.pipeline(data.name);
        return {
          output: {
            error: error instanceof Error ? error.message : String(error),
            ...(p ? { inputs: p.inputs.map((i) => ({ name: i.name, description: i.description, options: i.options ?? [], ...(i.default ? { default: i.default } : {}) })), stages: p.stages.map((s) => s.id) } : { available: brain.pipelines().map((x) => x.name) }),
          },
        };
      }
    },
  });

  const run = pipelines.runs.inConversation(ctx.conversationId);
  if (run?.status === 'waiting' && run.waiting?.kind === 'params') {
    useTool({
      name: 'pipeline_provide',
      description: `Hand over the values the developer gave for the stage that is waiting (${run.waiting.missing?.join(', ')}). Never credentials.`,
      input: v.object({ values: v.record(v.string(), v.string()) }),
      async run({ data }) {
        try {
          return { output: { next: pipelines.engine.decide(run.id, 'continue', data.values) ?? 'ok' } };
        } catch (error) {
          return { output: { error: error instanceof Error ? error.message : String(error) } };
        }
      },
    });
  }
}
