/**
 * @orbi/plugin-sdk — what an Orbi plugin implements.
 *
 * A plugin is a folder in the plugins directory whose entry file
 * (package.json "main", or index.mjs / index.js) default-exports an OrbiPlugin.
 * The runtime discovers it at start; `ORBI_LLM=<plugin name>` activates an LLM plugin.
 *
 * Everything here is types: import them with `import type` (TypeScript) or
 * JSDoc (`@type {import('@orbi/plugin-sdk').OrbiPlugin}`), so the plugin has no
 * runtime dependency on Orbi and keeps working across Orbi updates that keep
 * `PLUGIN_API_VERSION`.
 */
export * from './llm.ts';
import type { LlmAdapterFactory } from './llm.ts';

/** Bumped only on breaking changes to the contract. Plugins declare the version they were written for. */
export const PLUGIN_API_VERSION = 1;

export interface LlmPlugin {
  kind: 'llm';
  /** Name used in ORBI_LLM=<name>. Lowercase, digits and dashes. */
  name: string;
  /** Contract version the plugin was written for (PLUGIN_API_VERSION). */
  apiVersion: 1;
  /** One line shown in the Autonomia screen. */
  description?: string;
  /** Builds the adapter from the ORBI_LLM_* settings. */
  create: LlmAdapterFactory;
}

/** Every kind of plugin Orbi accepts. More kinds (transcription, vault, tools) can join this union. */
export type OrbiPlugin = LlmPlugin;
