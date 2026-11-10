import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import type { Platform } from './types.ts';

const join = posix.join;

/** What macOS and Linux share. */
const unix = {
  path: posix,
  shellCandidates: () => ['/bin/bash', '/usr/bin/bash', '/bin/zsh'],
  shellSuggestions: () => ['/bin/bash', '/usr/local/bin/bash'],
  shellQuestion: 'Onde está o bash? Preciso dele para rodar este comando.',
  shellToolDirs: () => [],
  programExtensions: () => [''],
  programAliases: (binary: string) => [{ name: binary, prefix: [] }],
  skipsPathDir: () => false,
  needsShell: () => false,
  childEnvKeys: [],
};

export const macos: Platform = {
  ...unix,
  id: 'darwin',
  appDataHome: (_env, home) => join(home, 'Library', 'Application Support', 'br.com.zup.orbi'),
  chromePaths: () => ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  // A .command file opens in Terminal, in a new window, with the developer's own session.
  terminalWindow: (script) => ({ command: '/usr/bin/open', args: ['-a', 'Terminal', script] }),
};

export const linux: Platform = {
  ...unix,
  id: 'linux',
  appDataHome: (env, home) => join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'br.com.zup.orbi'),
  chromePaths: () => ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  terminalWindow: (script, _shell, env) => {
    const options: Array<[string, string[]]> = [
      ['/usr/bin/x-terminal-emulator', ['-e', 'bash', script]],
      ['/usr/bin/gnome-terminal', ['--', 'bash', script]],
      ['/usr/bin/konsole', ['-e', 'bash', script]],
      ['/usr/bin/xterm', ['-hold', '-e', 'bash', script]],
    ];
    const found = options.find(([command]) => existsSync(command));
    return found ? { command: found[0], args: found[1], env } : null;
  },
};
