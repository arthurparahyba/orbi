import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulidx';
import { runShell } from '../terminal/exec.ts';
import { agentLine } from './command.ts';
import type { CodeAgent } from './types.ts';

export const TEST_PROMPT = 'Responda apenas com a palavra ok. Não leia nem altere arquivos.';

/**
 * Sends a short request to an agent, in an empty folder, to check it is installed, logged in and
 * answers in one-shot mode without waiting for a keypress. It costs a request on the agent's
 * account, so it runs only when the developer asks (Testar).
 */
export async function testAgent(
  agent: CodeAgent,
  opts: { model?: string | null; scratchDir: string; shell: string | null; env: Record<string, string | undefined>; timeoutMs?: number },
): Promise<{ ok: boolean; detail: string }> {
  if (!opts.shell) return { ok: false, detail: 'nenhum shell encontrado (Git Bash no Windows): configure o caminho do bash.exe' };
  const dir = join(opts.scratchDir, 'agent-tests', ulid().toLowerCase());
  mkdirSync(dir, { recursive: true });
  const started = Date.now();
  try {
    const ran = await runShell(opts.shell, agentLine(agent.command, TEST_PROMPT, opts.model ?? null), {
      cwd: dir,
      env: opts.env,
      shell: opts.shell,
      // The developer's own tool: their session (login, proxy, certificates), not the Orbi's keys.
      inherit: 'developer',
      timeoutMs: opts.timeoutMs ?? 120_000,
    });
    const secs = Math.round((Date.now() - started) / 1000);
    if (ran.timedOut) return { ok: false, detail: `não respondeu em ${secs} s: pode estar esperando login ou uma confirmação` };
    if (ran.exitCode !== 0) return { ok: false, detail: `saiu com ${ran.exitCode}: ${(ran.stderr || ran.stdout).trim().slice(-300)}` };
    return { ok: true, detail: `respondeu em ${secs} s${opts.model ? ` com ${opts.model}` : ''}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
