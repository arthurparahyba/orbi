import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';

/**
 * In a conversation a coding agent asked for (orbi_delegate), Orbi reports the
 * outcome with agent_reply: that short result is what the agent reads with
 * orbi_status. Other conversations don't get the tool.
 */
export const agentRequest = defineCapability({ name: 'agentRequest', needs: ['agents'], register: useAgentRequest });

function useAgentRequest(ctx: AgentContext, { agents }: Deps<'agents'>) {
  const req = agents.requests.byConversation(ctx.conversationId);
  if (!req) return;

  useTool({
    name: 'agent_reply',
    description: `Report the outcome of the request from the coding agent "${req.agent}" (${req.id}) when it is finished or cannot go on. The agent reads only this: a short summary, the result and links (PR, run, ticket). Never credentials or long logs. Call it once, at the end.`,
    input: v.object({
      status: v.picklist(['done', 'failed']),
      summary: v.pipe(v.string(), v.minLength(1), v.maxLength(1000)),
      links: v.optional(v.pipe(v.array(v.pipe(v.string(), v.maxLength(500))), v.maxLength(10))),
    }),
    async run({ data }) {
      const done = agents.requests.finish(req.id, data);
      return done && done.status === data.status ? `Resposta entregue ao agente ${req.agent}.` : 'Este pedido já tinha sido encerrado.';
    },
  });
}
