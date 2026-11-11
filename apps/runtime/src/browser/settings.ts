import { resolve } from 'node:path';
import type { ChromeSettings, SetChromeSettings } from '@orbi/contracts';
import type { OrbiConfig } from '../config.ts';
import { setEnvValue } from '../settings/env-file.ts';
import { chromeExecutable } from './chrome.ts';

/**
 * The Chrome DevTools settings, from Configurações › Ferramentas (MCP) (docs/funcionalidades/20).
 * Same path as the model: written to the .env the runtime reads at start, put in this
 * process's environment and in the live configuration, then the bridge restarts.
 */
type Chrome = OrbiConfig['chrome'];

export function chromeSettings(chrome: Chrome): ChromeSettings {
  let detected: string | undefined;
  let detectError: string | undefined;
  try {
    detected = chromeExecutable(chrome.executablePath);
  } catch (error) {
    detectError = error instanceof Error ? error.message : String(error);
  }
  return {
    browser: chrome.browserUrl ? 'seu' : 'proprio',
    browserUrl: chrome.browserUrl ?? null,
    showWindow: !chrome.headless,
    autostart: chrome.autostart,
    profileDir: chrome.profileDir,
    executablePath: chrome.executablePath ?? null,
    detected: detected ?? null,
    detectError: detectError ?? null,
    port: chrome.port,
    debugPort: chrome.debugPort,
  };
}

/** Only a Chrome on this machine: Orbi never drives a browser across the network. */
export function browserUrlProblem(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'Endereço inválido. Ex.: http://127.0.0.1:9222';
  }
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || !u.port) return 'Use o endereço local da depuração do seu Chrome, com a porta. Ex.: http://127.0.0.1:9222';
  return undefined;
}

/** What goes to the .env for a choice ('' removes the setting: the default applies). */
export function chromeEnv(input: SetChromeSettings, dataDir: string): Record<string, string> {
  const own = input.browser === 'proprio';
  const profile = input.profileDir && resolve(input.profileDir) !== resolve(dataDir, 'chrome-profile') ? input.profileDir : '';
  return {
    CHROME_BROWSER_URL: own ? '' : (input.browserUrl ?? ''),
    CHROME_HEADLESS: input.showWindow ? 'false' : 'true',
    CHROME_MCP_AUTOSTART: input.autostart ? 'true' : 'false',
    CHROME_PROFILE_DIR: profile,
    CHROME_PATH: input.executablePath ?? '',
  };
}

/** Saves and applies; returns a problem to show, or the new settings. */
export function applyChromeSettings(
  input: SetChromeSettings,
  config: { cwd: string; dataDir: string; chrome: Chrome },
  env: NodeJS.ProcessEnv = process.env,
  envFile = resolve(config.cwd, '.env'),
): { problem: string } | { settings: ChromeSettings } {
  if (input.browser === 'seu') {
    const problem = browserUrlProblem(input.browserUrl ?? '');
    if (problem) return { problem };
  }
  const next = chromeEnv(input, config.dataDir);
  for (const [key, value] of Object.entries(next)) {
    if ((env[key] ?? '') !== value) setEnvValue(envFile, key, value);
    env[key] = value;
  }
  Object.assign(config.chrome, {
    browserUrl: next.CHROME_BROWSER_URL || undefined,
    headless: next.CHROME_HEADLESS === 'true',
    autostart: next.CHROME_MCP_AUTOSTART !== 'false',
    profileDir: resolve(config.cwd, next.CHROME_PROFILE_DIR || `${config.dataDir}/chrome-profile`),
    executablePath: next.CHROME_PATH || undefined,
  });
  return { settings: chromeSettings(config.chrome) };
}
