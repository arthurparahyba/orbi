/**
 * The `models` context — what the Orbi thinks with (documento 26, map in `docs/modulos.md`).
 *
 * This is the context's only door: nothing outside imports a file inside `provider/`,
 * `plugins/`, `roles/`, `cost/` or `setup/` (test/boundary.test.ts checks it). It owns no table
 * of its own; what it keeps goes under the `models` keys of `platform`'s preferences.
 *
 * provider  which provider is active and the adapter that talks to it
 * plugins   adapters found on disk and the check that they answer
 * roles     the four roles and the model of each turn
 * cost      how costly each model is
 * setup     how the developer chooses, tests and applies a provider
 */

export { rescanPlugins } from './use-cases/rescan-plugins.ts';

export { configureLlm, llmChoice, llmSettings, ADAPTERS } from './provider/src/provider.ts';
export type { ActiveLlm, LlmChoice, LlmAdapter, LlmAdapterFactory, LlmSettings } from './provider/src/provider.ts';

export { discoverPlugins, pluginDirs, describePlugins } from './plugins/src/plugins.ts';
export type { PluginInfo } from './plugins/src/plugins.ts';

export { ModelRoles, MODEL_ROLES, resolveRoles, turnRole, modelForTurn } from './roles/src/roles.ts';
export type { ModelRole } from './roles/src/roles.ts';

export { ModelTiers, modelChoices, knownTier, CLAUDE_MODELS } from './cost/src/cost.ts';
export type { ModelChoices } from './cost/src/cost.ts';

export { modelOptions, modelStatus, testModel, applyModel, envFor } from './setup/src/setup.ts';
export type { ModelStatus, ModelOption, TestResult } from './setup/src/setup.ts';

export { modelRoutes } from './http.ts';
