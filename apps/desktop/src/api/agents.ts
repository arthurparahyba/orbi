/**
 * Os agentes de código que chamam o Orbi por MCP: quem pode, o que delegou e o que sugeriu.
 */

import type { AgentClient, AgentClientCreated, AgentRequest, AgentSuggestion, EditAgentClient, Playbook } from '@orbi/contracts';
import { request } from './request.ts';

export const agentsApi = {
  agentClients: () => request<AgentClient[]>('/api/agents/clients'),
  createAgentClient: (name: string) => request<AgentClientCreated>('/api/agents/clients', { method: 'POST', body: JSON.stringify({ name }) }),
  editAgentClient: (id: string, change: EditAgentClient) => request<AgentClient>(`/api/agents/clients/${id}`, { method: 'PATCH', body: JSON.stringify(change) }),
  revokeAgentClient: (id: string) => request<AgentClient>(`/api/agents/clients/${id}`, { method: 'DELETE' }),
  agentRequests: () => request<AgentRequest[]>('/api/agents/requests'),
  suggestions: (status: AgentSuggestion['status'] | 'all' = 'open') => request<AgentSuggestion[]>(`/api/agents/suggestions?status=${status === 'all' ? '' : status}`),
  acceptSuggestion: (id: string, variationOf?: string) =>
    request<Playbook>(`/api/agents/suggestions/${id}/accept`, { method: 'POST', body: JSON.stringify(variationOf ? { variationOf } : {}) }),
  rejectSuggestion: (id: string) => request<AgentSuggestion>(`/api/agents/suggestions/${id}/reject`, { method: 'POST' }),
};
