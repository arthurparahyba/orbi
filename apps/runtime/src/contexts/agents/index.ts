/**
 * **Os agentes de código que chamam o Orbi.** Claude Code, Codex e afins, na máquina do
 * desenvolvedor, falando com o Orbi pelo servidor MCP: delegam tarefa (`orbi_delegate`), perguntam
 * como vai (`orbi_status`) e sugerem procedimento (`orbi_teach`). Este contexto responde a uma
 * pergunta só: **o que vem de fora, e de quem**.
 *
 * Não confundir com dois vizinhos de nome parecido:
 * - `contexts/tools` guarda os agentes de código que **o Orbi chama** (a tabela `code_agents`) — é
 *   a direção contrária desta;
 * - `src/agents/` é o runtime dos agentes **do próprio Orbi** (o do chat, o configurador, o
 *   revisor), que não é contexto: é a composição.
 *
 * Um agente nunca aprova nada, nunca vê credencial e nunca escreve no cérebro: o que ele sugere
 * espera na tela Agentes até o desenvolvedor aceitar.
 */

export { delegateTask, type Delegated, type Delegation, type NotDelegated } from './use-cases/delegate-task.ts';
export { runPipelineForAgent, type PipelineDelegated, type PipelineDelegation, type PipelineNotRun } from './use-cases/run-pipeline-for-agent.ts';
export { requestProgress, type NoRequest } from './use-cases/request-progress.ts';

export { AgentClients, type AgentClient } from './clients/src/clients.ts';
export { AgentRequests, type AgentRequest, type AgentRequestContext, type AgentRequestStatus } from './requests/src/requests.ts';
export { AgentSuggestions, type AgentSuggestion } from './suggestions/src/suggestions.ts';
export { handleMcp } from './server/src/server.ts';
export { requestStatus, type RequestStatus } from './server/src/status.ts';
export { procedureName, ToolError, toolsFor, type McpCall } from './server/src/tools.ts';
export { agentRoutes } from './http.ts';
export { mcpRoutes } from './mcp-http.ts';
