/**
 * A revisão e o diagnóstico: o que a revisão guardou, o que deu errado e a issue que sai daqui.
 */

import type { Diagnosis, DiagnosisReport, DiagnosisSetup, IssueDraft, IssueSent, ReviewNote } from '@orbi/contracts';
import { request } from './request.ts';

export const improvementApi = {
  /** What the end-of-run review kept: ideas for a procedure, environments to fix. */
  reviewNotes: (filter: { playbook?: string; kind?: ReviewNote['kind']; status?: ReviewNote['status'] } = {}) =>
    request<ReviewNote[]>(`/api/review-notes?${new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>)}`),
  setReviewNote: (id: string, status: 'dismissed' | 'done' | 'kept') =>
    request<ReviewNote>(`/api/review-notes/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  /** O que deu errado por culpa do Orbi ou de uma chamada do modelo; sem `run`, os que estão abertos. */
  diagnoses: (run?: string) => request<Diagnosis[]>(`/api/diagnoses${run ? `?run=${encodeURIComponent(run)}` : ''}`),
  /** Quem escreve o relatório do diagnóstico e quando. */
  diagnosisSetup: () => request<DiagnosisSetup>('/api/diagnoses/setup'),
  setDiagnosisSetup: (next: Partial<DiagnosisSetup>) => request<DiagnosisSetup>('/api/diagnoses/setup', { method: 'PUT', body: JSON.stringify(next) }),
  /** O relatório de uma execução, e pedir que ele seja escrito agora. */
  diagnosisReport: (run: string) => request<DiagnosisReport | null>(`/api/diagnoses/report?run=${encodeURIComponent(run)}`),
  analyseRun: (run: string) => request<DiagnosisReport | { pendente: true }>(`/api/diagnoses/report?run=${encodeURIComponent(run)}`, { method: 'POST' }),
  /** "Ver o que vai": o texto exato da issue, com a lista do que foi trocado. */
  issueDraft: (id: string) => request<IssueDraft>(`/api/diagnoses/${encodeURIComponent(id)}/issue`),
  sendIssue: (id: string) => request<IssueSent>(`/api/diagnoses/${encodeURIComponent(id)}/issue`, { method: 'POST' }),
  dismissDiagnosis: (id: string) => request<{ ok: true }>(`/api/diagnoses/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }),
};
