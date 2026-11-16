/**
 * A autonomia: o nível de cada procedimento e as regras por categoria.
 */

import type { Autonomy, Category, Playbook, PlaybookAutonomy } from '@orbi/contracts';
import { request } from './request.ts';

export const trustApi = {
  setPlaybookAutonomy: (name: string, autonomy: Autonomy) =>
    request<Playbook>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify({ autonomy }) }),
  setPlaybookLevel: (name: string, change: { level?: 1 | 2 | 3; levelMax?: 1 | 2 | 3 }) =>
    request<Playbook>(`/api/brain/playbooks/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  playbookAutonomy: (name: string) => request<PlaybookAutonomy>(`/api/brain/playbooks/${encodeURIComponent(name)}/autonomy`),
  autonomy: () => request<{ categories: Record<Category, Autonomy> }>('/api/autonomy'),
  setAutonomy: (category: Category, level: Autonomy) =>
    request<{ categories: Record<Category, Autonomy> }>('/api/autonomy', { method: 'PATCH', body: JSON.stringify({ category, level }) }),
};
