import type { CommandProfile } from './types.ts';

/** Package managers and build tools: local, except what publishes a package or an artifact. */
export const npm: CommandProfile = {
  binary: 'npm',
  effect: (args) => (args[0] === 'unpublish' ? 'apaga' : args[0] === 'publish' ? 'publica' : 'local'),
  install: { darwin: 'vem com o Node: `brew install node`', win32: 'vem com o Node: `winget install OpenJS.NodeJS.LTS`' },
};

export const mvn: CommandProfile = {
  binary: 'mvn',
  effect: (args) => (args.some((x) => x === 'deploy' || x.endsWith(':deploy')) ? 'publica' : 'local'),
  install: { darwin: 'instale com `brew install maven`', win32: 'instale com `winget install Apache.Maven`' },
};
