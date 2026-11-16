/**
 * O cofre: os segredos que ele guarda (nunca o valor).
 */

import type { SecretInfo } from '@orbi/contracts';
import { request } from './request.ts';

export const secretsApi = {
  vault: () => request<{ backend: 'keychain' | 'file'; secrets: SecretInfo[] }>('/api/vault'),
  setSecret: (name: string, value: string, description?: string) =>
    request<SecretInfo>(`/api/vault/${name}`, { method: 'PUT', body: JSON.stringify({ value, ...(description ? { description } : {}) }) }),
  deleteSecret: (name: string) => request<{ deleted: boolean }>(`/api/vault/${name}`, { method: 'DELETE' }),
};
