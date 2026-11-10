/**
 * Everything that differs by operating system, behind one interface: where the app keeps the
 * developer's things, which shell to use, how programs are named and found, where Chrome is.
 * One implementation per system (windows.ts, macos.ts, linux.ts); the rest of the code asks
 * `platform()` instead of testing process.platform. A new difference is a new member here,
 * filled in each implementation.
 */
export type PlatformId = 'win32' | 'darwin' | 'linux';
type Env = NodeJS.ProcessEnv;

export interface Platform {
  id: PlatformId;
  /** The installed app's folder for the developer's things (.env, data, plugins). */
  appDataHome(env: Env, home: string): string;
  /** Where the developer's shell usually is, best first. */
  shellCandidates(env: Env): string[];
  /** Paths to suggest when no shell was found (the card that asks for it). */
  shellSuggestions(env: Env): string[];
  /** The question that card asks. */
  shellQuestion: string;
  /** Folders of tools that come with the shell (Git for Windows' usr\bin): joined to the PATH of commands. */
  shellToolDirs(shell: string): string[];
  /** Extensions a program file may have (PATHEXT on Windows). */
  programExtensions(env: Env): string[];
  /** Other names a program goes by here, tried in order (python3 → python, py -3 on Windows). */
  programAliases(binary: string): Array<{ name: string; prefix: string[] }>;
  /** PATH folders whose programs only look like the real thing (the Microsoft Store shortcuts). */
  skipsPathDir(dir: string): boolean;
  /** Program files that need a shell to start (.cmd on Windows). */
  needsShell(file: string): boolean;
  /** Extra variables a child process needs on this system. */
  childEnvKeys: string[];
  /** Where Chrome usually is. */
  chromePaths(env: Env): string[];
  /**
   * How to open a terminal window the developer sees, running `script` (a bash script): Terminal
   * on macOS, mintty (Git Bash) on Windows, the desktop's terminal on Linux. Null when there is none.
   */
  terminalWindow(script: string, shell: string | null, env?: Env): { command: string; args: string[]; env?: Env } | null;
  /** The path module of this system. */
  path: typeof import('node:path').posix;
}
