/**
 * As ferramentas: servidores MCP, o navegador do Orbi, as gravações e os agentes de código.
 */

import type { AddMcpServer, ApiError, ChooseModel, ChromeSettings, CodeAgent, CodeAgentTask, CodeAgentsState, EditMcpServer, McpServer, McpServerDetail, McpTestResult, ModelTestResult, Recording, SaveCodeAgent, SetChromeSettings, SetMcpTool, TestMcpServer } from '@orbi/contracts';
import { request, RUNTIME_URL } from './request.ts';

export const toolsApi = {
  /** MCP servers Orbi uses (Configurações › Ferramentas MCP). */
  mcpServers: () => request<McpServer[]>('/api/mcp-servers'),
  mcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}`),
  testMcpServer: (t: TestMcpServer) => request<McpTestResult>('/api/mcp-servers/test', { method: 'POST', body: JSON.stringify(t) }),
  reviewMcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/review`, { method: 'POST' }),
  approveMcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  addMcpServer: (s: AddMcpServer) => request<McpServerDetail>('/api/mcp-servers', { method: 'POST', body: JSON.stringify(s) }),
  editMcpServer: (id: string, s: EditMcpServer) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(s) }),
  refreshMcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/refresh`, { method: 'POST' }),
  /** Marca (ou desmarca) este servidor como o navegador do Orbi (documento 31). */
  setBrowserServer: (id: string, isBrowser: boolean) =>
    request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/browser`, { method: 'PUT', body: JSON.stringify({ isBrowser }) }),
  setMcpTool: (id: string, tool: string, s: SetMcpTool) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/tools/${encodeURIComponent(tool)}`, { method: 'PUT', body: JSON.stringify(s) }),
  removeMcpServer: (id: string) => request<{ removed: string }>(`/api/mcp-servers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Orbi's browser (Chrome DevTools): its settings; saving restarts it. */
  browserSettings: () => request<ChromeSettings>('/api/browser/settings'),
  setBrowserSettings: (s: SetChromeSettings) => request<ChromeSettings>('/api/browser/settings', { method: 'PUT', body: JSON.stringify(s) }),
  startRecording: (conversationId: string, url: string | undefined, narrated: boolean) =>
    request<Recording>('/api/recordings', { method: 'POST', body: JSON.stringify({ conversationId, url, narrated }) }),
  recording: (id: string) => request<Recording>(`/api/recordings/${id}`),
  activeRecording: () => request<Recording | null>('/api/recordings/active'),
  stopRecording: (id: string, discard = false) => request<Recording>(`/api/recordings/${id}/stop`, { method: 'POST', body: JSON.stringify({ discard }) }),
  /** Tests and, only if it works, saves and applies (422 with the reason when the test fails). */
  async chooseModel(choice: ChooseModel): Promise<ModelTestResult> {
    const res = await fetch(`${RUNTIME_URL}/api/model`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(choice) });
    const json = (await res.json().catch(() => ({}))) as ModelTestResult & Partial<ApiError>;
    if (json.error) throw new Error(json.error.message);
    return json;
  },
  codeAgents: () => request<CodeAgentsState>('/api/code-agents'),
  saveCodeAgent: (id: string, agent: SaveCodeAgent) => request<CodeAgent>(`/api/code-agents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(agent) }),
  removeCodeAgent: (id: string) => request<CodeAgentsState>(`/api/code-agents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  assignCodeAgent: (task: CodeAgentTask, agent: string | null, model: string | null) =>
    request<CodeAgentsState>(`/api/code-agents/tasks/${task}`, { method: 'PUT', body: JSON.stringify({ agent, model }) }),
  testCodeAgent: (id: string, model?: string | null) => request<{ ok: boolean; detail: string }>(`/api/code-agents/${encodeURIComponent(id)}/test`, { method: 'POST', body: JSON.stringify({ model: model ?? null }) }),
};
