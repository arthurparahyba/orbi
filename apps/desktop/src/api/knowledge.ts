/**
 * O cérebro: a foto do grafo, as entidades e o export.
 */

import type { BrainSnapshot, EditEntity, Entity, EntityDetail } from '@orbi/contracts';
import { request } from './request.ts';

export const knowledgeApi = {
  brain: () => request<BrainSnapshot>('/api/brain'),
  entity: (id: string) => request<EntityDetail>(`/api/brain/entities/${encodeURIComponent(id)}`),
  editEntity: (id: string, change: EditEntity) =>
    request<Entity>(`/api/brain/entities/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  deleteEntity: (id: string) =>
    request<{ deleted: true; relations: number }>(`/api/brain/entities/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  exportBrain: () => request<{ written: number; dir: string }>('/api/brain/export', { method: 'POST' }),
};
