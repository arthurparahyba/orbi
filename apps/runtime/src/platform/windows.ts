import { win32 } from 'node:path';
import type { Platform } from './types.ts';

const join = win32.join;

export const windows: Platform = {
  id: 'win32',
  path: win32 as never,
  appDataHome: (env, home) => join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'br.com.zup.orbi'),
  shellCandidates: (env) =>
    [
      env.ProgramFiles && join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
      env.ProgramW6432 && join(env.ProgramW6432, 'Git', 'bin', 'bash.exe'),
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
      'C:\\Program Files\\Git\\bin\\bash.exe',
    ].filter((c): c is string => !!c),
  shellSuggestions: (env) => ['C:\\Program Files\\Git\\bin\\bash.exe', `${env.LOCALAPPDATA ?? 'C:\\Users\\<você>\\AppData\\Local'}\\Programs\\Git\\bin\\bash.exe`],
  shellQuestion: 'Onde está o Git Bash (bash.exe)? Preciso dele para rodar este comando.',
  shellToolDirs: (shell) => {
    if (!/[\\/]Git[\\/]bin[\\/]bash\.exe$/i.test(shell)) return [];
    const git = win32.dirname(win32.dirname(shell));
    return [join(git, 'usr', 'bin'), join(git, 'mingw64', 'bin')];
  },
  programExtensions: (env) => (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';'),
  // python3 rarely exists on Windows: python, or the py launcher.
  programAliases: (binary) => (binary === 'python3' ? [{ name: 'python', prefix: [] }, { name: 'py', prefix: ['-3'] }, { name: 'python3', prefix: [] }] : [{ name: binary, prefix: [] }]),
  // The python*.exe in WindowsApps are Store shortcuts that open the Store instead of running.
  skipsPathDir: (dir) => /WindowsApps/i.test(dir),
  needsShell: (file) => /\.(cmd|bat)$/i.test(file),
  childEnvKeys: ['SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'TEMP', 'TMP'],
  chromePaths: (env) => [
    `${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
};
