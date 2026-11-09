import type { CommandProfile } from './types.ts';

export const gh: CommandProfile = {
  binary: 'gh',
  reads: (a) => {
    const [group, verb] = a;
    if (group === 'api') {
      // An explicit GET is a read even with -f/-F (they become query parameters).
      const m = a.findIndex((x) => x === '-X' || x === '--method');
      const method = m >= 0 ? (a.at(m + 1) ?? '').toUpperCase() : a.find((x) => x.startsWith('--method='))?.slice(9).toUpperCase();
      if (method) return method === 'GET' && !a.includes('--input');
      return !a.some((x) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(x));
    }
    return ['list', 'view', 'watch', 'status', 'checks', 'diff', 'download'].includes(verb ?? '') || group === 'search';
  },
  effect: (args) => {
    if (args.includes('delete') || (args.some((x) => /^(-X|--method)$/.test(x)) && args.some((x) => x.toUpperCase() === 'DELETE'))) return 'apaga';
    if (args[0] === 'repo' && ['clone', 'set-default'].includes(args[1] ?? '')) return 'local';
    return 'publica';
  },
  install: { darwin: 'instale com `brew install gh` e rode `gh auth login`', win32: 'instale com `winget install GitHub.cli` e rode `gh auth login`' },
};
