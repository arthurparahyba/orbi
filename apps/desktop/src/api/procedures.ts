/**
 * Os procedimentos e as esteiras: o que o Orbi sabe fazer, as execuções, a prova de cada passo e
 * o que já se tentou.
 */

import type { EditPlaybook, Pipeline, PipelineRun, Playbook, PlaybookProof, PlaybookRun, RunCall, SavePipeline, StepLearning } from '@orbi/contracts';
import { request, RUNTIME_URL } from './request.ts';

export const proceduresApi = {
  /** What was already tried in a procedure, by step. */
  stepLearnings: (playbook: string) => request<StepLearning[]>(`/api/step-learnings?playbook=${encodeURIComponent(playbook)}`),
  removeStepLearning: (id: string) => request<{ ok: true }>(`/api/step-learnings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Takes back what a run learned by itself about an input (passo 0). */
  undoResolved: (runId: string, input: string) =>
    request(`/api/brain/runs/${encodeURIComponent(runId)}/resolved/${encodeURIComponent(input)}/undo`, { method: 'POST' }),
  editPlaybook: (name: string, change: EditPlaybook) =>
    request<Playbook>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(change) }),
  deletePlaybook: (name: string) =>
    request<{ deleted: true; detachedVariations: string[] }>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  playbooks: () => request<Playbook[]>('/api/brain/playbooks'),
  runs: () => request<PlaybookRun[]>('/api/brain/runs'),
  /** Where each procedure stands: which of its steps already ran as they are written. */
  proofs: () => request<Record<string, PlaybookProof>>('/api/brain/proofs'),
  waiveProof: (playbook: string, step: string, waive: boolean) =>
    request<PlaybookProof>(`/api/brain/playbooks/${encodeURIComponent(playbook)}/steps/${encodeURIComponent(step)}/waive`, { method: waive ? 'POST' : 'DELETE' }),
  /** What each tool call of an execution did, and the whole execution as text to hand over. */
  runCalls: (id: string) => request<RunCall[]>(`/api/brain/runs/${encodeURIComponent(id)}/calls`),
  runTranscript: (id: string) => fetch(`${RUNTIME_URL}/api/brain/runs/${encodeURIComponent(id)}/transcript`).then((r) => r.text()),
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
};
