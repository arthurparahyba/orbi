/**
 * O gasto: tokens, custo estimado e tempo.
 */

import type { ApiError, UsageReport } from '@orbi/contracts';
import { request, RUNTIME_URL } from './request.ts';

export const telemetryApi = {
  async transcribe(wav: Blob): Promise<string> {
    const res = await fetch(`${RUNTIME_URL}/api/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
    const json = (await res.json().catch(() => ({}))) as { text?: string } & Partial<ApiError>;
    if (!res.ok) throw new Error(json.error?.message ?? `transcrição falhou (${res.status})`);
    return json.text ?? '';
  },
  usage: (days = 30) => request<UsageReport>(`/api/usage?days=${days}`),
};
