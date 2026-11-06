import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { llmChoice } from './llm/index.ts';

/**
 * Runtime configuration. `loadConfig` reads it from an environment object — no
 * side effects, nothing read at import — and `validateConfig` explains what is
 * wrong before anything starts. Every value has a safe default.
 */

/** Desktop launches (Tauri, Finder/Dock) don't inherit the shell's env: read <cwd>/.env when present. */
export function loadDotEnv(cwd = process.cwd()): string | undefined {
  const file = resolve(cwd, '.env');
  if (!existsSync(file)) return undefined;
  process.loadEnvFile(file);
  return file;
}

function list(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  /** Paths may start with ~ (shells expand it; Node doesn't) and are relative to cwd. */
  const path = (p: string) => resolve(cwd, p.replace(/^~(?=$|[\\/])/, homedir()));
  const dataDir = path(env.ORBI_DATA_DIR ?? './data');
  const at: Paths = { path, dataDir };
  const llm = llmChoice(env);

  return {
    cwd,
    /** Which LLM: 'anthropic' (default) or an adapter/plugin (ORBI_LLM; see src/llm). */
    llm: llm.kind,
    /** Model spec for every agent; with an adapter, `orbi-llm/<model>` (final once the adapter loads). */
    model: llm.model,
    /**
     * Claude Code fixes need the Anthropic API (or an Anthropic-compatible gateway via
     * ANTHROPIC_BASE_URL). On by default only with ORBI_LLM=anthropic; ORBI_CODE_FIXER=claude-code|off overrides.
     */
    codeFixer: (env.ORBI_CODE_FIXER ?? (llm.anthropic ? 'claude-code' : 'off')) === 'claude-code',
    /** Model for the Claude Code fixer (Claude Agent SDK model id). */
    codeModel: env.ORBI_CODE_MODEL ?? 'claude-haiku-5-5',
    /** Hard spend cap for one Claude Code fix, in USD. */
    codeFixBudgetUsd: Number(env.ORBI_CODE_FIX_BUDGET_USD ?? '0.5'),

    dataDir,
    /** Flue's own store (conversations, streams). */
    flueDb: path(env.ORBI_FLUE_DB ?? `${dataDir}/flue.db`),
    /** Orbi's database: the brain (ontology, graph, playbooks) and the app state (inbox, conversations, settings). */
    dbFile: path(env.ORBI_DB ?? `${dataDir}/orbi.db`),
    /** Where the brain lived before the single database; moved to dbFile on first start. */
    legacyBrainFile: path(env.ORBI_BRAIN_FILE ?? `${dataDir}/brain.db`),
    /** Read-only Markdown export of the brain, for Obsidian. */
    brainExportDir: path(env.ORBI_BRAIN_EXPORT_DIR ?? `${dataDir}/brain-md`),
    /** JSON files of versions before the single database; imported once, then renamed *.importado. */
    legacy: {
      policyFile: resolve(dataDir, 'autonomy.json'),
      inboxFile: resolve(dataDir, 'inbox.json'),
      conversationsFile: resolve(dataDir, 'conversations.json'),
    },

    /** Folder where repositories are cloned; commands run inside it or a repo below it. */
    workspace: path(env.ORBI_WORKSPACE ?? './workspace'),
    /** Scratch folder for Python investigation scripts and fix worktrees. */
    scratchDir: path(env.ORBI_SCRATCH_DIR ?? `${dataDir}/scratch`),

    /** CLIs the agent may run. No shell: each call is binary + arguments. */
    allowedBinaries: list(env.ORBI_ALLOWED_BINARIES, ['git', 'gh', 'aws', 'python3']),

    /** Optional bearer token every HTTP route requires. */
    apiToken: env.ORBI_API_TOKEN,
    /** PID of the desktop shell that started us: exit when it is gone. */
    parentPid: env.ORBI_PARENT_PID ? Number(env.ORBI_PARENT_PID) : undefined,
    /** Seconds between checks for due follow-ups. */
    followupIntervalMs: Number(env.ORBI_FOLLOWUP_INTERVAL_MS ?? '15000'),

    chrome: chromeConfig(env, at),
    vault: vaultConfig(env, at),
    /** Speech-to-text for narrated demonstrations. */
    stt: sttConfig(env, at),
    /** Credentials passed to CLI tools explicitly; never the whole environment. */
    cliEnv: cliEnv(env),




  };
}

export type OrbiConfig = ReturnType<typeof loadConfig>;

/** How config sections turn relative paths (and ~) into absolute ones, and where data lives. */
interface Paths {
  path(p: string): string;
  dataDir: string;
}

function chromeConfig(env: NodeJS.ProcessEnv, { path, dataDir }: Paths) {
  return {
    /** Port of the local stdio→HTTP bridge in front of chrome-devtools-mcp. */
    port: Number(env.CHROME_MCP_PORT ?? '8931'),
    /** Bearer token the bridge requires. Generated per process when unset. */
    token: env.CHROME_MCP_TOKEN ?? randomBytes(24).toString('hex'),
    /** Attach to the developer's Chrome (remote debugging on) instead of launching a separate profile. */
    browserUrl: env.CHROME_BROWSER_URL,
    headless: env.CHROME_HEADLESS === 'true',
    /** Remote-debugging port of the Chrome Orbi launches (shared by the MCP and the recorder). */
    debugPort: Number(env.CHROME_DEBUG_PORT ?? '9333'),
    /** Its profile: logins made in it persist between runs. */
    profileDir: path(env.CHROME_PROFILE_DIR ?? `${dataDir}/chrome-profile`),
    executablePath: env.CHROME_PATH,
    /** Start the bridge together with the server. */
    autostart: env.CHROME_MCP_AUTOSTART !== 'false',
  };
}

function vaultConfig(env: NodeJS.ProcessEnv, { dataDir }: Paths) {
  return {
    prefer: (env.ORBI_VAULT ?? 'auto') as 'auto' | 'keychain' | 'file',
    indexFile: resolve(dataDir, 'secrets.json'),
    dataFile: resolve(dataDir, 'secrets.enc'),
    keyFile: resolve(dataDir, 'vault.key'),
  };
}

function sttConfig(env: NodeJS.ProcessEnv, { path, dataDir }: Paths) {
  return {
    /** local (Whisper on this machine via transformers.js) · http (OpenAI-compatible /audio/transcriptions) · off */
    backend: (env.ORBI_STT ?? (env.ORBI_STT_URL ? 'http' : 'local')) as 'local' | 'http' | 'off',
    localModel: env.ORBI_STT_LOCAL_MODEL ?? 'onnx-community/whisper-small',
    url: env.ORBI_STT_URL,
    apiKey: env.ORBI_STT_API_KEY,
    model: env.ORBI_STT_MODEL ?? 'whisper-1',
    language: env.ORBI_STT_LANGUAGE ?? 'pt',
    modelsDir: path(env.ORBI_MODELS_DIR ?? `${dataDir}/models`),
  };
}

function cliEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return {
    GH_TOKEN: env.GH_TOKEN,
    AWS_PROFILE: env.AWS_PROFILE,
    AWS_REGION: env.AWS_REGION,
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: env.AWS_SESSION_TOKEN,
  };
}

/** Problems that would only show up later (a bad port, a missing URL), in plain words. */
export function validateConfig(c: OrbiConfig): string[] {
  const problems: string[] = [];
  const port = (name: string, value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 65535) problems.push(`${name} deve ser uma porta (1–65535), veio ${value}`);
  };
  port('CHROME_MCP_PORT', c.chrome.port);
  port('CHROME_DEBUG_PORT', c.chrome.debugPort);
  if (!Number.isFinite(c.codeFixBudgetUsd) || c.codeFixBudgetUsd <= 0) problems.push('ORBI_CODE_FIX_BUDGET_USD deve ser um número maior que zero');
  if (!['local', 'http', 'off'].includes(c.stt.backend)) problems.push(`ORBI_STT deve ser local, http ou off (veio ${c.stt.backend})`);
  if (c.stt.backend === 'http' && !c.stt.url) problems.push('ORBI_STT=http precisa de ORBI_STT_URL');
  if (!['auto', 'keychain', 'file'].includes(c.vault.prefer)) problems.push(`ORBI_VAULT deve ser auto, keychain ou file (veio ${c.vault.prefer})`);
  if (!Number.isFinite(c.followupIntervalMs) || c.followupIntervalMs < 1000) problems.push('ORBI_FOLLOWUP_INTERVAL_MS deve ser ≥ 1000');
  if (c.parentPid !== undefined && !Number.isInteger(c.parentPid)) problems.push('ORBI_PARENT_PID inválido');
  return problems;
}
