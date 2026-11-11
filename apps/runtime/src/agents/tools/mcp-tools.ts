import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';
import { agentToolName, categoryOf, effectOf } from '../../mcp-client/domain.ts';
import { toValibot } from '../../mcp-client/schema.ts';
import { needsApproval } from '../../mcp-client/store.ts';
import { log } from '../../observability/log.ts';

/** Past this many tools the prompt gets heavy: the rest stays out (and the log says so). */
const MAX_TOOLS = 60;

/**
 * The MCP servers the developer added (docs/funcionalidades/20): every enabled tool becomes a
 * tool of the agent, `<servidor>__<ferramenta>`, with the server's own input. All of them go
 * through the gate under the server's rule (leitura or escrita): reads run alone by default,
 * writes ask, a tool that deletes is never run alone. The list only changes when a server
 * connects, so the agent's tools stay stable between turns.
 */
export const mcpTools = defineCapability({ name: 'mcp-tools', needs: ['mcpServers', 'mcpHub'], register: useMcpTools });

function useMcpTools(ctx: AgentContext, { mcpServers, mcpHub }: Deps<'mcpServers' | 'mcpHub'>) {
  let count = 0;
  // A program waiting for your approval does not run: its tools stay out until you approve.
  for (const server of mcpServers.list().filter((s) => s.enabled && !needsApproval(s))) {
    for (const tool of mcpServers.tools(server.id).filter((t) => t.enabled)) {
      if (++count > MAX_TOOLS) {
        log.warn('ferramentas MCP demais: as restantes ficam fora', { conversation: ctx.conversationId, server: server.id, tool: tool.name });
        return;
      }
      const kind = tool.effective;
      ctx.gated({
        name: agentToolName(server.id, tool.name),
        description: `[${server.name}, ${kind === 'leitura' ? 'leitura' : kind === 'apaga' ? 'apaga' : 'escrita'}] ${tool.description || tool.name}`.slice(0, 1000) +
          ' Credentials: write a vault reference ({{segredo:nome}}) where one is needed; it is replaced inside this tool.',
        input: toValibot(tool.inputSchema),
        category: () => categoryOf(server.id, kind),
        effect: () => effectOf(kind),
        summary: () => `${server.name} · ${tool.name}`,
        title: () => `${server.name} · ${tool.name}`,
        command: (args) => `${tool.name} ${JSON.stringify(args)}`.slice(0, 300),
        execute: (args, _id, _how, signal) => mcpHub.call(server.id, tool.name, args, signal),
      });
    }
  }
}
