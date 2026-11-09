import type { CommandProfile } from './types.ts';

/** git's global options come before the verb (`git -C dir status`): skip them to find the verb. */
export function gitVerbArgs(args: readonly string[]): readonly string[] {
  let i = 0;
  while (i < args.length) {
    const a = args[i]!;
    if (a === '-C' || a === '-c' || a === '--git-dir' || a === '--work-tree' || a === '--namespace') i += 2;
    else if (a.startsWith('--git-dir=') || a.startsWith('--work-tree=') || a.startsWith('--namespace=') || a === '--no-pager' || a === '-P' || a === '--bare') i += 1;
    else break;
  }
  return args.slice(i);
}

const READ_VERBS = ['status', 'log', 'diff', 'show', 'fetch', 'branch', 'rev-parse', 'ls-files', 'blame', 'remote'];

export const git: CommandProfile = {
  binary: 'git',
  reads: (all) => {
    const a = gitVerbArgs(all);
    return READ_VERBS.includes(a[0] ?? '')
      && !(a[0] === 'branch' && a.some((x) => ['-d', '-D', '-m', '-M', '--delete', '--move'].includes(x)))
      && !(a[0] === 'remote' && a[1] !== undefined && a[1] !== '-v' && a[1] !== 'show' && a[1] !== 'get-url');
  },
  effect: (args) => {
    const a = gitVerbArgs(args);
    const verb = a[0] ?? '';
    if (verb === 'push') {
      return a.some((x) => ['-f', '--force', '--force-with-lease', '-d', '--delete', '--mirror', '--prune'].includes(x) || /^:/.test(x) || x.startsWith('--force'))
        ? 'apaga'
        : 'publica';
    }
    if (verb === 'clean' || (verb === 'reset' && a.includes('--hard')) || (verb === 'branch' && a.some((x) => x === '-D' || x === '--delete' || x === '-d'))) return 'apaga';
    return 'local';
  },
  install: { darwin: 'no macOS vem com `xcode-select --install`', win32: 'instale com `winget install Git.Git`' },
};
