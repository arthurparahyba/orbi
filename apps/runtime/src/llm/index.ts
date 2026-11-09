import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setProvider } from '../agents/runtime-port.ts';
import { ADAPTER_PROVIDER, toPiProvider } from './pi-bridge.ts';
import { openAICompatible } from './adapters/openai-compatible.ts';
import { discoverPlugins, pluginDirs, type PluginInfo } from './plugins.ts';
import type { LlmAdapter, LlmAdapterFactory, LlmSettings } from './types.ts';

export type { LlmAdapter, LlmAdapterFactory, LlmSettings } from './types.ts';
export { describePlugins, discoverPlugins, pluginDirs, type PluginInfo } from './plugins.ts';

/**
 * Which model Orbi talks to, chosen in .env:
 *
 *   ORBI_LLM=anthropic                  (default) Claude via the Anthropic API, ANTHROPIC_API_KEY
 *   ORBI_LLM=openai-compatible          any /chat/completions endpoint (see adapters/openai-compatible.ts)
 *   ORBI_LLM=<plugin>                   a plugin from the plugins folder (see docs/plugins.md) —
 *                                       the way to connect a company's own LLM without touching Orbi
 *   ORBI_LLM=<name>                     an adapter compiled in (ADAPTERS below)
 *   ORBI_LLM=module:./meu-adaptador.mjs a single file exporting an LlmAdapterFactory
 */
export const ADAPTERS: Record<string, LlmAdapterFactory> = {
  'openai-compatible': openAICompatible,
};

export interface LlmChoice {
  /** 'anthropic' or the adapter name. */
  kind: string;
  /** Model spec for useModel(): `anthropic/claude-haiku-5-5` or `orbi-llm/<model>`. */
  model: string;
  /** Whether the Anthropic-only features (Claude Code fixer) have what they need. */
  anthropic: boolean;
}

/** Read the choice from the environment (no I/O): config.ts uses this to name the model. */
export function llmChoice(env: NodeJS.ProcessEnv = process.env): LlmChoice {
  const kind = (env.ORBI_LLM ?? 'anthropic').trim() || 'anthropic';
  if (kind === 'anthropic') {
    return { kind, model: env.ORBI_MODEL ?? 'anthropic/claude-haiku-5-5', anthropic: true };
  }
  return { kind, model: `${ADAPTER_PROVIDER}/${env.ORBI_LLM_MODEL ?? 'default'}`, anthropic: false };
}

export function llmSettings(env: NodeJS.ProcessEnv = process.env): LlmSettings {
  let headers: Record<string, string> | undefined;
  if (env.ORBI_LLM_HEADERS) {
    try {
      headers = JSON.parse(env.ORBI_LLM_HEADERS);
    } catch {
      throw new Error('ORBI_LLM_HEADERS deve ser um JSON, ex.: {"x-tenant":"time-x"}');
    }
  }
  return {
    model: env.ORBI_LLM_MODEL,
    baseUrl: env.ORBI_LLM_BASE_URL,
    apiKey: env.ORBI_LLM_API_KEY,
    headers,
    env: Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[0].startsWith('ORBI_LLM') && e[1] !== undefined)),
  };
}

async function loadFactory(kind: string, cwd: string, plugins: PluginInfo[]): Promise<LlmAdapterFactory> {
  if (kind.startsWith('module:')) {
    const spec = kind.slice('module:'.length).trim();
    const file = isAbsolute(spec) ? spec : resolve(cwd, spec);
    const mod = await import(/* @vite-ignore */ pathToFileURL(file).href);
    const factory = mod.default ?? mod.createAdapter;
    if (typeof factory !== 'function') throw new Error(`${file} deve exportar por padrão uma função (settings) => LlmAdapter`);
    return factory;
  }
  if (ADAPTERS[kind]) return ADAPTERS[kind];
  const named = plugins.filter((p) => p.name === kind);
  const usable = named.find((p) => p.plugin && p.kind === 'llm');
  if (usable?.plugin) return usable.plugin.create;
  if (named[0]?.error) throw new Error(`plugin "${kind}" (${named[0].dir}) não pôde ser usado: ${named[0].error}`);
  const llmPlugins = plugins.filter((p) => p.plugin && p.kind === 'llm').map((p) => p.name);
  throw new Error(
    `ORBI_LLM="${kind}" desconhecido. Opções: anthropic, ${[...Object.keys(ADAPTERS), ...llmPlugins].join(', ')}, module:<arquivo>`,
  );
}

/** Check that the adapter looks right before the first conversation, with a clear message if not. */
function assertAdapter(adapter: LlmAdapter, kind: string): void {
  if (!adapter || typeof adapter.chat !== 'function') throw new Error(`adaptador "${kind}" não tem chat(request, signal)`);
  if (!adapter.name) throw new Error(`adaptador "${kind}" sem name`);
  if (!Array.isArray(adapter.models) || adapter.models.length === 0) throw new Error(`adaptador "${kind}" sem models`);
}

export interface ActiveLlm extends LlmChoice {
  adapter?: LlmAdapter;
  /** Why the chosen model could not be set up at start (a plugin that failed): the app asks to choose. */
  error?: string;
  /** Plugins found at start (with load errors, if any). */
  plugins: PluginInfo[];
}

/**
 * Register the chosen model with the agent runtime. Call once at start, before
 * any conversation. Anthropic needs nothing: Flue registers it from the build.
 */
export async function configureLlm(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  plugins?: PluginInfo[],
): Promise<ActiveLlm> {
  const found = plugins ?? (await discoverPlugins(pluginDirs(env, cwd)));
  const choice = llmChoice(env);
  if (choice.kind === 'anthropic') return { ...choice, plugins: found };
  const settings = llmSettings(env);
  const adapter = await (await loadFactory(choice.kind, cwd, found))(settings);
  assertAdapter(adapter, choice.kind);
  // ORBI_LLM_MODEL picks among the adapter's models; without it, the first one.
  const modelId = settings.model ?? adapter.models[0].id;
  if (!adapter.models.some((m) => m.id === modelId)) adapter.models.unshift({ id: modelId });
  setProvider(toPiProvider(adapter));
  return { ...choice, model: `${ADAPTER_PROVIDER}/${modelId}`, adapter, plugins: found };
}
