/**
 * O modelo: qual é, quais existem, quanto custa cada um e o de cada tipo de trabalho.
 */

import type { ChooseModel, ModelChoices, ModelRoles, ModelStatus, ModelTestResult } from '@orbi/contracts';
import { request } from './request.ts';

export const modelsApi = {
  /** The model of each kind of work (talking, running, learning and correcting, the knowledge review). */
  modelRoles: () => request<ModelRoles>('/api/model/roles'),
  setModelRole: (role: keyof ModelRoles, model: string | null) => request<ModelRoles>('/api/model/roles', { method: 'PUT', body: JSON.stringify({ role, model }) }),
  /** The models a conversation may pick (the active provider's), the default first, with their cost. */
  modelChoices: () => request<ModelChoices>('/api/model/choices'),
  setModelTier: (model: string, tier: 'cheap' | 'standard' | 'premium' | null) =>
    request<ModelChoices>('/api/model/tiers', { method: 'PUT', body: JSON.stringify({ model, tier }) }),
  model: () => request<ModelStatus>('/api/model'),
  rescanPlugins: () => request<ModelStatus>('/api/model/plugins/rescan', { method: 'POST' }),
  testModel: (choice: ChooseModel) => request<ModelTestResult>('/api/model/test', { method: 'POST', body: JSON.stringify(choice) }),
};
