/**
 * O modelo: qual é, quais existem, quanto custa cada um e o de cada tipo de trabalho.
 */

/** The model the Orbi thinks with (first opening, Autonomia › Modelo). */
export interface ModelOption {
  kind: string; label: string; description: string;
  source: 'plugin' | 'anthropic' | 'adapter';
  fields: Array<'apiKey' | 'baseUrl' | 'model'>;
  models: string[];
  error?: string; dir?: string;
}

/** GET /api/model */
export interface ModelStatus {
  ready: boolean; kind: string; model: string; label: string;
  problem?: string;
  /** A key is set (never the key itself). */
  keySet: boolean;
  options: ModelOption[];
}

/** GET /api/model/choices — the models a conversation may use (the active provider's), the default first. */
export interface ModelChoices {
  default: string;
  models: Array<{ id: string; tier?: 'cheap' | 'standard' | 'premium'; tierBy?: 'voce' | 'plugin' | 'conhecido' }>;
}

export type ModelRoles = Record<'conversa' | 'executar' | 'aprender' | 'conhecimento', { model: string; set: boolean }>;

/** POST /api/model/test · PUT /api/model */
export interface ModelTestResult { ok: boolean; detail: string; model?: string }
