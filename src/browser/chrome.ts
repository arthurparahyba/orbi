import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { config } from '../config.ts';

/**
 * One Chrome shared by the agent (chrome-devtools-mcp) and the recorder.
 * Launched on first use with its own profile (data/chrome-profile), so logins
 * done once — by the developer during a demonstration or by the Vigia — stay.
 * Set CHROME_BROWSER_URL to use a Chrome you started yourself instead.
 */
let child: ChildProcess | undefined;
let starting: Promise<string> | undefined;

const debugUrl = () => config.chrome.browserUrl ?? `http://127.0.0.1:${config.chrome.debugPort}`;

async function alive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/json/version`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

export function chromeExecutable(): string {
  const candidates = [
    config.chrome.executablePath,
    ...(process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : process.platform === 'win32'
        ? [`${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome não encontrado; defina CHROME_PATH');
  return found;
}

/** Make sure the shared Chrome answers on its debugging port; returns its URL. */
export function ensureChrome(): Promise<string> {
  const url = debugUrl();
  starting ??= (async () => {
    if (await alive(url)) return url;
    if (config.chrome.browserUrl) throw new Error(`Chrome em ${url} não responde (CHROME_BROWSER_URL)`);
    mkdirSync(config.chrome.profileDir, { recursive: true });
    const args = [
      `--remote-debugging-port=${config.chrome.debugPort}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${config.chrome.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(config.chrome.headless ? ['--headless=new'] : []),
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      'about:blank',
    ];
    child = spawn(chromeExecutable(), args, { stdio: 'ignore' });
    child.once('exit', () => { child = undefined; starting = undefined; });
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
    return ensureChrome();
  });
}

export function chromeDebugUrl(): string {
  return debugUrl();
}

export function stopChrome() {
  child?.kill();
}
process.once('exit', stopChrome);
