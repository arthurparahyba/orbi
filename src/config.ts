import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Runtime configuration, read once from the environment.
 * Every value has a safe default so the app starts with only ANTHROPIC_API_KEY set.
 */
function list(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

// Desktop launches (Tauri, Finder/Dock) don't inherit the shell's env: read ./.env when present.
try {
  process.loadEnvFile(resolve('.env'));
} catch {
  /* no .env — rely on the environment */
}

const dataDir = resolve(process.env.VIGIA_DATA_DIR ?? './data');

export const config = {
  /** Model for every Flue agent and subagent (Pi catalog specifier). */
  model: process.env.VIGIA_MODEL ?? 'anthropic/claude-haiku-5-5',
  /** Model for the Claude Code fixer (Claude Agent SDK model id). */
  codeModel: process.env.VIGIA_CODE_MODEL ?? 'claude-haiku-5-5',
  /** Hard spend cap for one Claude Code fix, in USD. */
  codeFixBudgetUsd: Number(process.env.VIGIA_CODE_FIX_BUDGET_USD ?? '0.5'),

  dataDir,
  /** The brain: one SQLite file (ontology, graph, playbooks). */
  brainFile: resolve(process.env.VIGIA_BRAIN_FILE ?? `${dataDir}/brain.db`),
  /** Read-only Markdown export of the brain, for Obsidian. */
  brainExportDir: resolve(process.env.VIGIA_BRAIN_EXPORT_DIR ?? `${dataDir}/brain-md`),
  policyFile: resolve(`${dataDir}/autonomy.json`),
  inboxFile: resolve(`${dataDir}/inbox.json`),

  /** Folder where repositories are cloned; commands run inside it or a repo below it. */
  workspace: resolve(process.env.VIGIA_WORKSPACE ?? './workspace'),
  /** Scratch folder for Python investigation scripts and fix worktrees. */
  scratchDir: resolve(process.env.VIGIA_SCRATCH_DIR ?? `${dataDir}/scratch`),

  /** CLIs the agent may run. No shell: each call is binary + arguments. */
  allowedBinaries: list(process.env.VIGIA_ALLOWED_BINARIES, ['git', 'gh', 'aws', 'python3']),

  chrome: {
    /** Port of the local stdio→HTTP bridge in front of chrome-devtools-mcp. */
    port: Number(process.env.CHROME_MCP_PORT ?? '8931'),
    /** Bearer token the bridge requires. Generated per process when unset. */
    token: process.env.CHROME_MCP_TOKEN ?? randomBytes(24).toString('hex'),
    /** Attach to the developer's Chrome (remote debugging on) instead of launching a separate profile. */
    browserUrl: process.env.CHROME_BROWSER_URL,
    headless: process.env.CHROME_HEADLESS === 'true',
    /** Remote-debugging port of the Chrome the Vigia launches (shared by the MCP and the recorder). */
    debugPort: Number(process.env.CHROME_DEBUG_PORT ?? '9333'),
    /** Its profile: logins made in it persist between runs. */
    profileDir: resolve(process.env.CHROME_PROFILE_DIR ?? `${dataDir}/chrome-profile`),
    executablePath: process.env.CHROME_PATH,
    /** Start the bridge together with the server. */
    autostart: process.env.CHROME_MCP_AUTOSTART !== 'false',
  },

  vault: {
    prefer: (process.env.VIGIA_VAULT ?? 'auto') as 'auto' | 'keychain' | 'file',
    indexFile: resolve(`${dataDir}/secrets.json`),
    dataFile: resolve(`${dataDir}/secrets.enc`),
    keyFile: resolve(`${dataDir}/vault.key`),
  },

  /** Speech-to-text for narrated demonstrations. */
  stt: {
    /** local (Whisper on this machine via transformers.js) · http (OpenAI-compatible /audio/transcriptions) · off */
    backend: (process.env.VIGIA_STT ?? (process.env.VIGIA_STT_URL ? 'http' : 'local')) as 'local' | 'http' | 'off',
    localModel: process.env.VIGIA_STT_LOCAL_MODEL ?? 'onnx-community/whisper-small',
    url: process.env.VIGIA_STT_URL,
    apiKey: process.env.VIGIA_STT_API_KEY,
    model: process.env.VIGIA_STT_MODEL ?? 'whisper-1',
    language: process.env.VIGIA_STT_LANGUAGE ?? 'pt',
    modelsDir: resolve(process.env.VIGIA_MODELS_DIR ?? `${dataDir}/models`),
  },

  /** Credentials passed to CLI tools explicitly; never the whole environment. */
  cliEnv: {
    GH_TOKEN: process.env.GH_TOKEN,
    AWS_PROFILE: process.env.AWS_PROFILE,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
  },
};

export type VigiaConfig = typeof config;
