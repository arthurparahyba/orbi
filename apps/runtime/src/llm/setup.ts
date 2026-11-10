import { resolve } from 'node:path';
import { setEnvValue } from '../settings/env-file.ts';
import { rememberOrbiEnvKeys } from '../terminal/orbi-env.ts';
import { ADAPTERS, configureLlm, llmSettings, type ActiveLlm } from './index.ts';
import type { PluginInfo } from './plugins.ts';
import type { ChatEvent, ChatResult, LlmAdapter, LlmAdapterFactory } from './types.ts';

/**
 * Choosing the model from the app (first opening, Autonomia › Modelo) instead of editing a .env
 * by hand: the options that exist on this machine, a test before anything is saved, and the
 * choice applied at once, without a restart. Keys go from the form to the .env of the data
 * folder (never to the model, the conversation or the logs); a plugin brings its own access.
 */

export type ModelField = 'apiKey' | 'baseUrl' | 'model';

export interface ModelOption {
  /** What ORBI_LLM takes: 'anthropic', 'openai-compatible' or a plugin's name. */
  kind: string;
  label: string;
  description: string;
  source: 'plugin' | 'anthropic' | 'adapter';
  /** What the form asks. A plugin asks only the model: its access comes with it. */
  fields: ModelField[];
  /** Models to pick from (a plugin's own list; Claude's). Empty: typed by the developer. */
  models: string[];
  /** Why it cannot be used (a plugin that failed to load). */
  error?: string;
  dir?: string;
}

export interface ModelStatus {
  ready: boolean;
  kind: string;
  /** The model in use, without the provider prefix. */
  model: string;
  label: string;
  /** Why it is not ready, in words. */
  problem?: string;
  /** For Anthropic and OpenAI-compatible: a key is set (never the key itself). */
  keySet: boolean;
  options: ModelOption[];
}

export interface ModelChoice {
  kind: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface TestResult {
  ok: boolean;
  detail: string;
}

export const CLAUDE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'];
const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';

const shortModel = (spec: string) => spec.replace(/^(anthropic|orbi-llm)\//, '');

/** The options of this machine: plugins first (the company's), then Claude, then any OpenAI-compatible server. */
export async function modelOptions(plugins: PluginInfo[], env: NodeJS.ProcessEnv = process.env): Promise<ModelOption[]> {
  const fromPlugins: ModelOption[] = [];
  for (const p of plugins.filter((x) => x.kind === 'llm' || x.error)) {
    let models: string[] = [];
    let error = p.error;
    if (!error && p.plugin) {
      try {
        models = (await p.plugin.create({ ...llmSettings(env), model: undefined })).models.map((m) => m.id);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    fromPlugins.push({ kind: p.name, label: p.name, description: p.description ?? 'Plugin desta máquina', source: 'plugin', fields: ['model'], models, dir: p.dir, ...(error ? { error } : {}) });
  }
  return [
    ...fromPlugins,
    { kind: 'anthropic', label: 'Claude, com a sua chave da Anthropic', description: 'Uma chave de API criada no console da Anthropic.', source: 'anthropic', fields: ['apiKey', 'model'], models: CLAUDE_MODELS },
    { kind: 'openai-compatible', label: 'Outro servidor compatível com OpenAI', description: 'Um gateway interno ou outro fornecedor: endereço, chave e modelo.', source: 'adapter', fields: ['baseUrl', 'apiKey', 'model'], models: [] },
  ];
}

/** Where the model stands now, for the first-opening screen and Autonomia › Modelo. */
export async function modelStatus(llm: ActiveLlm, env: NodeJS.ProcessEnv = process.env): Promise<ModelStatus> {
  const options = await modelOptions(llm.plugins, env);
  const option = options.find((o) => o.kind === llm.kind);
  const keySet = llm.kind === 'anthropic' ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.ORBI_LLM_API_KEY);
  let problem = llm.error;
  if (!problem && llm.kind === 'anthropic' && !keySet) problem = 'falta a chave da Anthropic';
  return { ready: !problem, kind: llm.kind, model: shortModel(llm.model), label: option?.label ?? llm.kind, keySet, options, ...(problem ? { problem } : {}) };
}

/** The env a choice would run with: what is set now, changed by the form. */
export function envFor(choice: ModelChoice, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env, ORBI_LLM: choice.kind };
  if (choice.kind === 'anthropic') {
    if (choice.apiKey) next.ANTHROPIC_API_KEY = choice.apiKey.trim();
    if (choice.model) next.ORBI_MODEL = `anthropic/${choice.model}`;
  } else {
    if (choice.model) next.ORBI_LLM_MODEL = choice.model;
    else delete next.ORBI_LLM_MODEL;
    if (choice.baseUrl) next.ORBI_LLM_BASE_URL = choice.baseUrl.trim();
    if (choice.apiKey) next.ORBI_LLM_API_KEY = choice.apiKey.trim();
  }
  return next;
}

/** Claude: the key is checked by listing the models (costs nothing). */
async function testAnthropic(key: string | undefined, fetchImpl: typeof fetch): Promise<TestResult> {
  if (!key) return { ok: false, detail: 'Falta a chave da Anthropic.' };
  try {
    const res = await fetchImpl(ANTHROPIC_MODELS_URL, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return { ok: true, detail: 'Chave válida: a Anthropic respondeu (conferido sem gastar).' };
    if (res.status === 401 || res.status === 403) return { ok: false, detail: 'A Anthropic recusou esta chave. Confira se copiou inteira (começa com sk-ant-) e se ela não foi apagada no console.' };
    return { ok: false, detail: `A Anthropic respondeu ${res.status}. Tente de novo em instantes.` };
  } catch {
    return { ok: false, detail: 'Não deu para falar com api.anthropic.com. Pode ser a rede ou um proxy da empresa; se a empresa usa um gateway, escolha o plugin dela ou um servidor compatível com OpenAI.' };
  }
}

/** A plugin or a server: one short request. */
async function testAdapter(factory: LlmAdapterFactory, env: NodeJS.ProcessEnv, name: string): Promise<TestResult> {
  const started = Date.now();
  let adapter: LlmAdapter;
  try {
    adapter = await factory(llmSettings(env));
  } catch (e) {
    return { ok: false, detail: `${name} não pôde ser iniciado: ${e instanceof Error ? e.message : String(e)}` };
  }
  const model = env.ORBI_LLM_MODEL ?? adapter.models[0]?.id;
  if (!model) return { ok: false, detail: `${name} não declara nenhum modelo.` };
  try {
    const signal = AbortSignal.timeout(60_000);
    const answer = adapter.chat({ model, system: 'Responda apenas com a palavra ok.', messages: [{ role: 'user', content: 'ok?' }], tools: [], maxTokens: 16 }, signal);
    let text = '';
    if (Symbol.asyncIterator in (answer as object)) {
      for await (const ev of answer as AsyncIterable<ChatEvent>) if (ev.type === 'text') text += ev.delta;
    } else {
      text = (await (answer as Promise<ChatResult>)).text ?? '';
    }
    const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
    if (!text.trim()) return { ok: false, detail: `${name} aceitou o pedido e devolveu uma resposta vazia. O modelo ${model} existe? Tente outro da lista.` };
    return { ok: true, detail: `${name} respondeu em ${secs} s com ${model}.` };
  } catch (e) {
    return { ok: false, detail: `${name} não respondeu: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Tests a choice without saving anything. */
export async function testModel(choice: ModelChoice, opts: { env?: NodeJS.ProcessEnv; plugins: PluginInfo[]; fetchImpl?: typeof fetch }): Promise<TestResult> {
  const env = envFor(choice, opts.env ?? process.env);
  if (choice.kind === 'anthropic') return testAnthropic(env.ANTHROPIC_API_KEY, opts.fetchImpl ?? fetch);
  if (choice.kind === 'openai-compatible' && !env.ORBI_LLM_BASE_URL) return { ok: false, detail: 'Falta o endereço do servidor.' };
  const plugin = opts.plugins.find((p) => p.name === choice.kind);
  if (plugin?.error) return { ok: false, detail: `O plugin ${plugin.name} não carregou: ${plugin.error}` };
  const factory = ADAPTERS[choice.kind] ?? plugin?.plugin?.create;
  if (!factory) return { ok: false, detail: `Opção desconhecida: ${choice.kind}` };
  return testAdapter(factory, env, plugin ? `O plugin ${plugin.name}` : 'O servidor');
}

/**
 * Tests, and only if it works: writes the choice to the .env of the data folder (the key
 * included, never anywhere else), puts it in this process's environment and registers the
 * model now, so the next turn already uses it.
 */
export async function applyModel(
  choice: ModelChoice,
  s: { llm: ActiveLlm; config: { cwd: string; model: string } },
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; envFile?: string } = {},
): Promise<TestResult & { model?: string }> {
  const env = opts.env ?? process.env;
  const test = await testModel(choice, { env, plugins: s.llm.plugins, fetchImpl: opts.fetchImpl });
  if (!test.ok) return test;
  const next = envFor(choice, env);
  const file = opts.envFile ?? resolve(s.config.cwd, '.env');
  const keys = ['ORBI_LLM', 'ANTHROPIC_API_KEY', 'ORBI_MODEL', 'ORBI_LLM_MODEL', 'ORBI_LLM_BASE_URL', 'ORBI_LLM_API_KEY'] as const;
  for (const key of keys) {
    if (next[key] !== undefined && next[key] !== env[key]) setEnvValue(file, key, next[key]!);
    if (next[key] !== undefined) env[key] = next[key];
  }
  // Written by the model screen: the Orbi's, never handed to a coding agent.
  rememberOrbiEnvKeys(keys.filter((k) => next[k] !== undefined && (k !== 'ANTHROPIC_API_KEY' || choice.apiKey)));
  const llm = await configureLlm(env, s.config.cwd, s.llm.plugins);
  Object.assign(s.llm, { adapter: undefined, error: undefined }, llm);
  s.config.model = llm.model;
  return { ...test, model: shortModel(llm.model) };
}
