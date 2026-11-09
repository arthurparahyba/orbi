import type { CommandProfile } from './types.ts';

/** Small file tools and interpreters. */
export const cat: CommandProfile = { binary: 'cat', reads: () => true };
export const rm: CommandProfile = { binary: 'rm', effect: () => 'apaga' };
export const rmdir: CommandProfile = { binary: 'rmdir', effect: () => 'apaga' };

const python = {
  // Scripts can do anything: governed by their own tools (run_python, run_script).
  install: {
    darwin: 'no macOS vem com `xcode-select --install` (ou `brew install python`)',
    win32: 'instale com `winget install Python.Python.3.12` (o Orbi usa `python` ou `py` no Windows)',
  },
};
export const python3: CommandProfile = { binary: 'python3', ...python };
