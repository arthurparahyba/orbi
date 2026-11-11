import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from '../platform/index.ts';
import { existsSync, mkdirSync } from 'node:fs';
import type { OrbiConfig } from '../config.ts';

/**
 * One Chrome shared by the agent (chrome-devtools-mcp) and the recorder.
 * Launched on first use with its own profile (data/chrome-profile), so logins
 * done once — by the developer during a demonstration or by the Orbi — stay.
 * Set CHROME_BROWSER_URL to use a Chrome you started yourself instead.
 */
export interface SharedChrome {
  /** DevTools URL of the shared Chrome (it may not be running yet). */
  debugUrl(): string;
  /** Make sure it answers on its debugging port; returns the URL. */
  ensure(): Promise<string>;
  stop(): void;
}

async function alive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/json/version`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

export function chromeExecutable(executablePath?: string): string {
  const candidates = [
    executablePath,
    ...platform().chromePaths(process.env),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome não encontrado; defina CHROME_PATH');
  return found;
}

export function createChrome(chrome: OrbiConfig['chrome']): SharedChrome {
  let child: ChildProcess | undefined;
  let starting: Promise<string> | undefined;
  const debugUrl = () => chrome.browserUrl ?? `http://127.0.0.1:${chrome.debugPort}`;

  function ensure(): Promise<string> {
    const url = debugUrl();
    starting ??= (async () => {
      if (await alive(url)) return url;
      if (chrome.browserUrl) throw new Error(`Chrome em ${url} não responde (CHROME_BROWSER_URL)`);
      mkdirSync(chrome.profileDir, { recursive: true });
      const args = [
        `--remote-debugging-port=${chrome.debugPort}`,
        '--remote-debugging-address=127.0.0.1',
        `--user-data-dir=${chrome.profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        ...(chrome.headless ? ['--headless=new'] : []),
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
        'about:blank',
      ];
      child = spawn(chromeExecutable(chrome.executablePath), args, { stdio: 'ignore' });
      child.once('exit', () => {
        child = undefined;
        starting = undefined;
      });
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (await alive(url)) return url;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error('Chrome não abriu a porta de depuração a tempo');
    })().catch((error) => {
      starting = undefined;
      throw error;
    });
    return starting.then(async (u) => {
      // Closed by the user since the last call? Start again.
      if (await alive(u)) return u;
      starting = undefined;
      return ensure();
    });
  }

  // Stopping also forgets the address in use: the next call starts from the settings as they are now.
  return { debugUrl, ensure, stop: () => { child?.kill(); starting = undefined; } };
}
