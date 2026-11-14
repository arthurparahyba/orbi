import type {
  CodeAgent, CodeAgentsState, CodeAgentTask, SaveCodeAgent, ChooseModel, ModelStatus, ModelTestResult,
  AgentClient, AgentClientCreated, ProvideSecret, VoiceStatus, Followup, Pipeline, PipelineRun, SavePipeline, AgentRequest, AgentSuggestion, EditAgentClient,
  ApiError, Autonomy, UsageReport, BrainSnapshot, Category, ConversationInfo, ConversationNotebook, ModelChoices, ModelRoles, ChromeSettings, SetChromeSettings, McpServer, McpServerDetail, McpTestResult, AddMcpServer, TestMcpServer, EditMcpServer, SetMcpTool, ReviewNote, RunCall, PlaybookProof, Diagnosis, StepLearning, EditEntity, EditPlaybook, Entity, EntityDetail, Health, InboxItem, Playbook, PlaybookAutonomy, PlaybookRun, Recording, SecretInfo,
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
/** Configuration chats (`config:…`) have their own agent in the runtime (agents/configurador.ts). */
export const configAgentUrl = (conversationId: string) => `${RUNTIME_URL}/agents/configurador/${encodeURIComponent(conversationId)}`;
export const CODE_AGENTS_CHAT = 'config:agentes-de-codigo';
export const isConfigChat = (conversationId: string) => conversationId.startsWith('config:');

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
  /** MCP servers Orbi uses (Configurações › Ferramentas MCP). */
  mcpServers: () => request<McpServer[]>('/api/mcp-servers'),
  mcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}`),
  testMcpServer: (t: TestMcpServer) => request<McpTestResult>('/api/mcp-servers/test', { method: 'POST', body: JSON.stringify(t) }),
  reviewMcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/review`, { method: 'POST' }),
  approveMcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  addMcpServer: (s: AddMcpServer) => request<McpServerDetail>('/api/mcp-servers', { method: 'POST', body: JSON.stringify(s) }),
  editMcpServer: (id: string, s: EditMcpServer) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(s) }),
  refreshMcpServer: (id: string) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/refresh`, { method: 'POST' }),
  setMcpTool: (id: string, tool: string, s: SetMcpTool) => request<McpServerDetail>(`/api/mcp-servers/${encodeURIComponent(id)}/tools/${encodeURIComponent(tool)}`, { method: 'PUT', body: JSON.stringify(s) }),
  removeMcpServer: (id: string) => request<{ removed: string }>(`/api/mcp-servers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** A message written inside a card: goes to the same conversation, shown in the card (docs/funcionalidades/21). */
  cardMessage: (conversationId: string, m: { card: string; title: string; context: string; text: string }) =>
    request<unknown>(`/api/conversations/${encodeURIComponent(conversationId)}/card-message`, { method: 'POST', body: JSON.stringify(m) }),
  /** Orbi's browser (Chrome DevTools): its settings; saving restarts it. */
  browserSettings: () => request<ChromeSettings>('/api/browser/settings'),
  setBrowserSettings: (s: SetChromeSettings) => request<ChromeSettings>('/api/browser/settings', { method: 'PUT', body: JSON.stringify(s) }),
  /** The model of each kind of work (talking, running, learning and correcting, the knowledge review). */
  modelRoles: () => request<ModelRoles>('/api/model/roles'),
  setModelRole: (role: keyof ModelRoles, model: string | null) => request<ModelRoles>('/api/model/roles', { method: 'PUT', body: JSON.stringify({ role, model }) }),
  /** What the end-of-run review kept: ideas for a procedure, environments to fix. */
  reviewNotes: (filter: { playbook?: string; kind?: ReviewNote['kind']; status?: ReviewNote['status'] } = {}) =>
    request<ReviewNote[]>(`/api/review-notes?${new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>)}`),
  setReviewNote: (id: string, status: 'dismissed' | 'done' | 'kept') =>
    request<ReviewNote>(`/api/review-notes/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  /** What was already tried in a procedure, by step. */
  stepLearnings: (playbook: string) => request<StepLearning[]>(`/api/step-learnings?playbook=${encodeURIComponent(playbook)}`),
  removeStepLearning: (id: string) => request<{ ok: true }>(`/api/step-learnings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** The model a conversation uses from its next turn; null = the default. */
  setConversationModel: (id: string, model: string | null) =>
    request<ConversationInfo>(`/api/conversations/${encodeURIComponent(id)}/model`, { method: 'PUT', body: JSON.stringify({ model }) }),
  /** The models a conversation may pick (the active provider's), the default first, with their cost. */
  modelChoices: () => request<ModelChoices>('/api/model/choices'),
  setModelTier: (model: string, tier: 'cheap' | 'standard' | 'premium' | null) =>
    request<ModelChoices>('/api/model/tiers', { method: 'PUT', body: JSON.stringify({ model, tier }) }),
  /** The "O que estou aprendendo" panel of a conversation, from the brain. */
  notebook: (id: string) => request<ConversationNotebook>(`/api/conversations/${encodeURIComponent(id)}/notebook`),
  deleteConversation: (id: string) => request<{ deleted: true }>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  renameConversation: (id: string, title: string) =>
    request<ConversationInfo>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  inbox: (status: InboxItem['status'] | 'all' = 'open') => request<InboxItem[]>(`/api/inbox${status === 'all' ? '?status=' : `?status=${status}`}`),
  decide: (id: string, decision: 'approve' | 'deny') =>
    request(`/api/inbox/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, approver: 'Você' }) }),
  provideSecret: (id: string, secret: ProvideSecret) => request(`/api/inbox/${id}/secret`, { method: 'POST', body: JSON.stringify(secret) }),
  answer: (id: string, text: string) => request(`/api/inbox/${id}/answer`, { method: 'POST', body: JSON.stringify({ text }) }),
  /** A note (level changed): seen, or undo the change. */
  dismissInbox: (id: string) => request(`/api/inbox/${id}/dismiss`, { method: 'POST' }),
  keepInbox: (id: string) => request(`/api/inbox/${id}/keep`, { method: 'POST' }),
  brain: () => request<BrainSnapshot>('/api/brain'),
  /** Takes back what a run learned by itself about an input (passo 0). */
  undoResolved: (runId: string, input: string) =>
    request(`/api/brain/runs/${encodeURIComponent(runId)}/resolved/${encodeURIComponent(input)}/undo`, { method: 'POST' }),
  entity: (id: string) => request<EntityDetail>(`/api/brain/entities/${encodeURIComponent(id)}`),
  editEntity: (id: string, change: EditEntity) =>
    request<Entity>(`/api/brain/entities/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  deleteEntity: (id: string) =>
    request<{ deleted: true; relations: number }>(`/api/brain/entities/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  editPlaybook: (name: string, change: EditPlaybook) =>
    request<Playbook>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(change) }),
  deletePlaybook: (name: string) =>
    request<{ deleted: true; detachedVariations: string[] }>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  playbooks: () => request<Playbook[]>('/api/brain/playbooks'),
  setPlaybookAutonomy: (name: string, autonomy: Autonomy) =>
    request<Playbook>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify({ autonomy }) }),
  setPlaybookLevel: (name: string, change: { level?: 1 | 2 | 3; levelMax?: 1 | 2 | 3 }) =>
    request<Playbook>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  playbookAutonomy: (name: string) => request<PlaybookAutonomy>(`/api/brain/playbooks/${encodeURIComponent(name)}/autonomy`),
  runs: () => request<PlaybookRun[]>('/api/brain/runs'),
  /** O que deu errado por culpa do Orbi ou de uma chamada do modelo; sem `run`, os que estão abertos. */
  diagnoses: (run?: string) => request<Diagnosis[]>(`/api/diagnoses${run ? `?run=${encodeURIComponent(run)}` : ''}`),
  dismissDiagnosis: (id: string) => request<{ ok: true }>(`/api/diagnoses/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }),
  /** Where each procedure stands: which of its steps already ran as they are written. */
  proofs: () => request<Record<string, PlaybookProof>>('/api/brain/proofs'),
  waiveProof: (playbook: string, step: string, waive: boolean) =>
    request<PlaybookProof>(`/api/brain/playbooks/${encodeURIComponent(playbook)}/steps/${encodeURIComponent(step)}/waive`, { method: waive ? 'POST' : 'DELETE' }),
  /** What each tool call of an execution did, and the whole execution as text to hand over. */
  runCalls: (id: string) => request<RunCall[]>(`/api/brain/runs/${encodeURIComponent(id)}/calls`),
  runTranscript: (id: string) => fetch(`${RUNTIME_URL}/api/brain/runs/${encodeURIComponent(id)}/transcript`).then((r) => r.text()),
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
  pipelines: () => request<Pipeline[]>('/api/pipelines'),
  savePipeline: (name: string, def: SavePipeline) => request<Pipeline>(`/api/pipelines/${name}`, { method: 'PUT', body: JSON.stringify(def) }),
  deletePipeline: (name: string) => request<{ deleted: true }>(`/api/pipelines/${name}`, { method: 'DELETE' }),
  /** A conversation where the Orbi proposes fixes for the esteira's configuration problems. */
  cancelPipelineRun: (runId: string) => request<PipelineRun>(`/api/pipeline-runs/${runId}/cancel`, { method: 'POST' }),
  fixPipeline: (name: string) => request<{ conversationId: string }>(`/api/pipelines/${encodeURIComponent(name)}/fix`, { method: 'POST' }),
  startPipeline: (name: string, inputs: Record<string, string>, destination: string | null) =>
    request<{ run: PipelineRun; conversationId: string }>(`/api/pipelines/${name}/start`, { method: 'POST', body: JSON.stringify({ inputs, destination }) }),
  pipelineRuns: (active = false) => request<PipelineRun[]>(`/api/pipeline-runs${active ? '?active=1' : ''}`),
  pipelineRunIn: (conversationId: string) => request<PipelineRun | null>(`/api/pipeline-runs/conversation/${encodeURIComponent(conversationId)}`),
  decidePipeline: (runId: string, decision: 'continue' | 'retry' | 'skip' | 'stop', values?: Record<string, string>) =>
    request<PipelineRun>(`/api/pipeline-runs/${runId}/decide`, { method: 'POST', body: JSON.stringify({ decision, ...(values ? { values } : {}) }) }),
  voice: () => request<VoiceStatus>('/api/voice'),
  /** Follow-ups waiting (all, or of one conversation), soonest first. */
  followups: (conversation?: string) => request<Followup[]>(`/api/followups${conversation ? `?conversation=${encodeURIComponent(conversation)}` : ''}`),
  cancelFollowup: (id: string) => request<Followup>(`/api/followups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  prepareVoice: () => request<VoiceStatus>('/api/voice/prepare', { method: 'POST' }),
  chooseVoiceModel: (model: string | null) => request<VoiceStatus>('/api/voice/model', { method: 'PUT', body: JSON.stringify({ model }) }),
  async transcribe(wav: Blob): Promise<string> {
    const res = await fetch(`${RUNTIME_URL}/api/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
    const json = (await res.json().catch(() => ({}))) as { text?: string } & Partial<ApiError>;
    if (!res.ok) throw new Error(json.error?.message ?? `transcrição falhou (${res.status})`);
    return json.text ?? '';
  },
  usage: (days = 30) => request<UsageReport>(`/api/usage?days=${days}`),
  vault: () => request<{ backend: 'keychain' | 'file'; secrets: SecretInfo[] }>('/api/vault'),
  setSecret: (name: string, value: string, description?: string) =>
    request<SecretInfo>(`/api/vault/${name}`, { method: 'PUT', body: JSON.stringify({ value, ...(description ? { description } : {}) }) }),
  deleteSecret: (name: string) => request<{ deleted: boolean }>(`/api/vault/${name}`, { method: 'DELETE' }),
  exportBrain: () => request<{ written: number; dir: string }>('/api/brain/export', { method: 'POST' }),
  agentClients: () => request<AgentClient[]>('/api/agents/clients'),
  createAgentClient: (name: string) => request<AgentClientCreated>('/api/agents/clients', { method: 'POST', body: JSON.stringify({ name }) }),
  editAgentClient: (id: string, change: EditAgentClient) => request<AgentClient>(`/api/agents/clients/${id}`, { method: 'PATCH', body: JSON.stringify(change) }),
  revokeAgentClient: (id: string) => request<AgentClient>(`/api/agents/clients/${id}`, { method: 'DELETE' }),
  agentRequests: () => request<AgentRequest[]>('/api/agents/requests'),
  suggestions: (status: AgentSuggestion['status'] | 'all' = 'open') => request<AgentSuggestion[]>(`/api/agents/suggestions?status=${status === 'all' ? '' : status}`),
  acceptSuggestion: (id: string, variationOf?: string) =>
    request<Playbook>(`/api/agents/suggestions/${id}/accept`, { method: 'POST', body: JSON.stringify(variationOf ? { variationOf } : {}) }),
  rejectSuggestion: (id: string) => request<AgentSuggestion>(`/api/agents/suggestions/${id}/reject`, { method: 'POST' }),
  model: () => request<ModelStatus>('/api/model'),
  rescanPlugins: () => request<ModelStatus>('/api/model/plugins/rescan', { method: 'POST' }),
  testModel: (choice: ChooseModel) => request<ModelTestResult>('/api/model/test', { method: 'POST', body: JSON.stringify(choice) }),
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
