/**
 * O cérebro: a foto do grafo, as entidades e o export.
 */

import type { BrainSnapshot, CreateDomain, Domain, DomainDetail, DomainOverview, EditEntity, Entity, EntityDetail, OntologyType } from '@orbi/contracts';
import { request } from './request.ts';

export const knowledgeApi = {
  brain: () => request<BrainSnapshot>('/api/brain'),
  entity: (id: string) => request<EntityDetail>(`/api/brain/entities/${encodeURIComponent(id)}`),
  editEntity: (id: string, change: EditEntity) =>
    request<Entity>(`/api/brain/entities/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  deleteEntity: (id: string) =>
    request<{ deleted: true; relations: number }>(`/api/brain/entities/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // `comum` não tem nome, e um segmento de rota não pode ser vazio: o runtime lê `-` por ele.
  domains: () => request<DomainOverview>('/api/brain/domains'),
  domain: (name: string) => request<DomainDetail>(`/api/brain/domains/${name ? encodeURIComponent(name) : '-'}`),
  createDomain: (domain: CreateDomain) =>
    request<Domain>('/api/brain/domains', { method: 'POST', body: JSON.stringify(domain) }),
  renameDomain: (from: string, name: string) =>
    request<Domain>(`/api/brain/domains/${encodeURIComponent(from)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  removeDomain: (name: string) =>
    request<{ deleted: true }>(`/api/brain/domains/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  setEntityDomain: (id: string, domain: string | null) =>
    request<Entity>(`/api/brain/entities/${encodeURIComponent(id)}/domain`, { method: 'PUT', body: JSON.stringify({ domain }) }),
  setTypeDomain: (name: string, domain: string | null) =>
    request<OntologyType>(`/api/brain/types/${encodeURIComponent(name)}/domain`, { method: 'PUT', body: JSON.stringify({ domain }) }),
  exportBrain: () => request<{ written: number; dir: string }>('/api/brain/export', { method: 'POST' }),
};
