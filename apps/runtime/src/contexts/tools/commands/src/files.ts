import type { CommandProfile } from './types.ts';

/** Small file tools and interpreters. */
export const cat: CommandProfile = { binary: 'cat', reads: () => true };
/** Tools that only show what is there. */
export const head: CommandProfile = { binary: 'head', reads: () => true };
export const tail: CommandProfile = { binary: 'tail', reads: () => true };
export const wc: CommandProfile = { binary: 'wc', reads: () => true };
export const ls: CommandProfile = { binary: 'ls', reads: () => true };
export const grep: CommandProfile = { binary: 'grep', reads: () => true };
/** find reads unless it is told to act on what it finds or to write a file. */
const FIND_ACTS = /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/;
export const find: CommandProfile = { binary: 'find', reads: (args) => !args.some((a) => FIND_ACTS.test(a)), effect: (args) => (args.includes('-delete') ? 'apaga' : args.some((a) => /^-(exec|execdir|ok|okdir)$/.test(a)) ? 'publica' : 'local') };
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
