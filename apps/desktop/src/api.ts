import type {
  ApiError, Autonomy, UsageReport, BrainSnapshot, Category, ConversationInfo, Entity, Edge, Health, InboxItem, Playbook, PlaybookRun, Recording, SecretInfo,
} from '@orbi/contracts';

export type * from '@orbi/contracts';

/**
 * Talking to the local runtime. In the browser/dev the Vite proxy serves it on
 * the same origin; inside the packaged Tauri app the page is tauri://localhost,
 * so requests go to the runtime's loopback address.
 */
const inTauri = typeof location !== 'undefined' && (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost');
export const RUNTIME_URL: string = import.meta.env.VITE_RUNTIME_URL ?? (inTauri ? 'http://127.0.0.1:3000' : '');

export const agentUrl = (conversationId: string) => `${RUNTIME_URL}/agents/orbi/${encodeURIComponent(conversationId)}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RUNTIME_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    // The runtime answers every error as ApiError ({ error: { code, message } }).
    const text = await res.text();
    let message = text;
    try {
      message = (JSON.parse(text) as ApiError).error.message ?? text;
    } catch {
      /* not JSON: keep the text */
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json() as Promise<T>;
}

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
  startRecording: (conversationId: string, url: string | undefined, narrated: boolean) =>
    request<Recording>('/api/recordings', { method: 'POST', body: JSON.stringify({ conversationId, url, narrated }) }),
  recording: (id: string) => request<Recording>(`/api/recordings/${id}`),
  activeRecording: () => request<Recording | null>('/api/recordings/active'),
  stopRecording: (id: string, discard = false) => request<Recording>(`/api/recordings/${id}/stop`, { method: 'POST', body: JSON.stringify({ discard }) }),
  async sendAudio(id: string, startedAt: number, durationMs: number, wav: Blob) {
    const res = await fetch(`${RUNTIME_URL}/api/recordings/${id}/audio?startedAt=${startedAt}&durationMs=${Math.round(durationMs)}`, {
      method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  },
  usage: (days = 30) => request<UsageReport>(`/api/usage?days=${days}`),
  vault: () => request<{ backend: 'keychain' | 'file'; secrets: SecretInfo[] }>('/api/vault'),
  setSecret: (name: string, value: string) => request<SecretInfo>(`/api/vault/${name}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  deleteSecret: (name: string) => request<{ deleted: boolean }>(`/api/vault/${name}`, { method: 'DELETE' }),
  exportBrain: () => request<{ written: number; dir: string }>('/api/brain/export', { method: 'POST' }),
};
