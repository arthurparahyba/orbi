/**
 * Contexto `models` — com o que o Orbi pensa (documento 26, mapa em `docs/modulos.md`).
 *
 * Esta é a única porta do contexto: nada de fora importa um arquivo de dentro de
 * `provider/`, `plugins/`, `roles/`, `cost/` ou `setup/` (test/boundary.test.ts acusa).
 * O contexto não tem tabela própria; o que ele guarda vai no namespace `models` de `settings`.
 *
 * provider  qual provedor está ativo e o adaptador que fala com ele
 * plugins   adaptadores achados no disco e o teste de que respondem
 * roles     os quatro papéis e o modelo de cada turno
 * cost      quão caro é cada modelo
 * setup     como o desenvolvedor escolhe, testa e aplica um provedor
 */

export { configureLlm, llmChoice, llmSettings, ADAPTERS } from './provider/src/provider.ts';
export type { ActiveLlm, LlmChoice, LlmAdapter, LlmAdapterFactory, LlmSettings } from './provider/src/provider.ts';

export { discoverPlugins, pluginDirs, describePlugins, appDataHome } from './plugins/src/plugins.ts';
export type { PluginInfo } from './plugins/src/plugins.ts';

export { ModelRoles, MODEL_ROLES, resolveRoles, turnRole, modelForTurn } from './roles/src/roles.ts';
export type { ModelRole } from './roles/src/roles.ts';

export { ModelTiers, modelChoices, knownTier, CLAUDE_MODELS } from './cost/src/cost.ts';
export type { ModelChoices } from './cost/src/cost.ts';

export { modelOptions, modelStatus, testModel, applyModel, envFor } from './setup/src/setup.ts';
export type { ModelStatus, ModelOption, TestResult } from './setup/src/setup.ts';

export { modelRoutes } from './http.ts';
