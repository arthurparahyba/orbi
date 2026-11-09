import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';

/** Clock: wake up later in the same conversation (the loop lives in compose.ts). */
export const clock = defineCapability({ name: 'clock', needs: ['brain'], register: useClock });

function useClock(ctx: AgentContext, { brain }: Deps<'brain'>) {
  useTool({
    name: 'schedule_followup',
    description:
      'Wake yourself up later in this conversation, e.g. to check a CI run, a deploy or a GMUD that takes minutes. Say what to check. End your turn after scheduling.',
    input: v.object({ minutes: v.pipe(v.number(), v.minValue(1), v.maxValue(1440)), note: v.string() }),
    async run({ data }) {
      const due = new Date(Date.now() + data.minutes * 60_000).toISOString();
      brain.scheduleFollowup(ctx.conversationId, due, data.note);
      return { output: { scheduledFor: due }, terminate: true };
    },
  });
}
