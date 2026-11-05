/**
 * Talking to the local runtime. In the browser/dev the Vite proxy serves it on
 * the same origin; inside the packaged Tauri app the page is tauri://localhost,
 * so requests go to the runtime's loopback address.
 */
const inTauri = location.protocol === 'tauri:' || location.hostname === 'tauri.localhost';
export const RUNTIME_URL: string = import.meta.env.VITE_RUNTIME_URL ?? (inTauri ? 'http://127.0.0.1:3000' : '');

export const agentUrl = (conversationId: string) => `${RUNTIME_URL}/agents/vigia/${encodeURIComponent(conversationId)}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RUNTIME_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── types mirrored from the runtime ────────────────────────────────────────
export interface ConversationInfo { id: string; title: string; createdAt: string; updatedAt: string }
export interface InboxItem {
  id: string; kind: 'approval' | 'question' | 'learning'; conversationId: string; title: string; detail: string;
  approvalId?: string; routine?: string; createdAt: string; status: 'open' | 'approved' | 'denied' | 'answered';
}
export interface OntologyType { name: string; description: string; relations: Record<string, string>; requires: string[] }
export interface Entity { id: string; type: string; props: Record<string, unknown>; body: string; updatedAt: string }
export interface Edge { from: string; rel: string; to: string; attrs: Record<string, unknown>; validFrom: string; validTo: string | null }
export interface Gap { entity: string; type: string; missing: string }
export type Autonomy = 'observe' | 'ask' | 'auto';
export interface Playbook {
  name: string; description: string; appliesTo: string | null; trigger: string; autonomy: Autonomy;
  steps: Array<{ id: string; label: string; how: string }>; instructions: string; uses: number; successes: number; updatedAt: string;
}
export interface PlaybookRun {
  id: string; playbook: string; conversationId: string; status: 'running' | 'done' | 'failed' | 'waiting';
  steps: Array<{ id: string; label: string; status: string; note?: string }>; startedAt: string; finishedAt: string | null;
}
export interface BrainSnapshot {
  stats: { entities: number; edges: number; playbooks: number; openProposals: number; types: number };
  gaps: Gap[]; types: OntologyType[]; entities: Entity[]; edges: Edge[];
}
export interface Health {
  model: string; codeModel: string; anthropicKey: boolean;
  chrome: { url: string; tools: number } | { error: string };
  brain: BrainSnapshot['stats'];
}
export type Category = 'comandos-leitura' | 'comandos-escrita' | 'navegador-leitura' | 'navegador-escrita' | 'codigo-teste' | 'codigo-producao' | 'aprender';

export const api = {
  health: () => request<Health>('/api/health'),
  conversations: () => request<ConversationInfo[]>('/api/conversations'),
  createConversation: (title?: string) => request<ConversationInfo>('/api/conversations', { method: 'POST', body: JSON.stringify({ title }) }),
  renameConversation: (id: string, title: string) =>
    request<ConversationInfo>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  inbox: (status: InboxItem['status'] | 'all' = 'open') => request<InboxItem[]>(`/api/inbox${status === 'all' ? '?status=' : `?status=${status}`}`),
  decide: (id: string, decision: 'approve' | 'deny') =>
    request(`/api/inbox/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, approver: 'Você' }) }),
  answer: (id: string, text: string) => request(`/api/inbox/${id}/answer`, { method: 'POST', body: JSON.stringify({ text }) }),
  brain: () => request<BrainSnapshot>('/api/brain'),
  entity: (id: string) =>
    request<{ entity: Entity; relations: { out: Edge[]; in: Edge[] }; nearby: Array<{ id: string; depth: number }> }>(
      `/api/brain/entities/${encodeURIComponent(id)}`,
    ),
  playbooks: () => request<Playbook[]>('/api/brain/playbooks'),
  setPlaybookAutonomy: (name: string, autonomy: Autonomy) =>
    request<Playbook>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify({ autonomy }) }),
  runs: () => request<PlaybookRun[]>('/api/brain/runs'),
  autonomy: () => request<{ categories: Record<Category, Autonomy> }>('/api/autonomy'),
  setAutonomy: (category: Category, level: Autonomy) =>
    request<{ categories: Record<Category, Autonomy> }>('/api/autonomy', { method: 'PATCH', body: JSON.stringify({ category, level }) }),
  exportBrain: () => request<{ written: number; dir: string }>('/api/brain/export', { method: 'POST' }),
};
