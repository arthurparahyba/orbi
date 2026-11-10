import { runShell, type RunResult } from '../terminal/exec.ts';
import { runInTerminalWindow } from './terminal-window.ts';
import type { CodeAgent } from './types.ts';

/**
 * Runs an agent's command line where the agent is set to run: in a terminal window the developer
 * sees (default: their own session, the agent's login works as in their terminal), or hidden in
 * the background with the developer's session minus what is the Orbi's.
 */
export function runAgent(
  agent: Pick<CodeAgent, 'runIn'>,
  line: string,
  opts: { cwd: string; title: string; scratchDir: string; shell: string; timeoutMs: number; signal?: AbortSignal; open?: (script: string) => void },
): Promise<RunResult> {
  if (agent.runIn === 'window') {
    return runInTerminalWindow({ line, cwd: opts.cwd, title: opts.title, scratchDir: opts.scratchDir, shell: opts.shell, timeoutMs: opts.timeoutMs, signal: opts.signal, open: opts.open });
  }
  return runShell(opts.shell, line, { cwd: opts.cwd, shell: opts.shell, signal: opts.signal, timeoutMs: opts.timeoutMs, inherit: 'developer' });
}
