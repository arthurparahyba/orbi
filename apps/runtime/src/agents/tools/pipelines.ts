import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import { startPipeline } from '../../contexts/procedures/index.ts';
import type { AgentContext } from '../context.ts';

/**
 * Esteiras from the conversation: start one the developer asked for ("entrega
 * o portal até a GMUD"), and hand over values the developer gave for a stage.
 * Creating or changing an esteira goes through brain_learn (approval card).
 */
export const pipelines = defineCapability({ name: 'pipelines', needs: ['procedures', 'pipelines'], register: usePipelines });

function usePipelines(ctx: AgentContext, { procedures, pipelines }: Deps<'procedures' | 'pipelines'>) {
  if (procedures.pipelineDefs.pipelines().length === 0) return;

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
      const started = startPipeline(
        { procedures, pipelines },
        { name: data.name, inputs: data.inputs, conversationId: ctx.conversationId, destination: data.destination },
      );
      if ('refused' in started) {
        return { output: { error: started.refused, ...(started.inputs ? { inputs: started.inputs } : {}) } };
      }
      return { output: { started: started.runId, next: started.next } };
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
