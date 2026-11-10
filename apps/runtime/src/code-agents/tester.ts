import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulidx';
import { runShell } from '../terminal/exec.ts';
import { agentLine } from './command.ts';
import { runAgent } from './run.ts';
import { orbiOwn } from '../terminal/orbi-env.ts';
import type { CodeAgent } from './types.ts';

/**
 * When the agent says it is not logged in but works in the developer's terminal: what differs.
 * Names only, never values: which program answered, which login-related variables exist, and
 * where its login could come from.
 */
/** Login-related variables the runtime has but does not hand to the agent (names only). */
function withheld(): string {
  return Object.keys(process.env).filter((k) => /^(CLAUDE|ANTHROPIC)/i.test(k) && orbiOwn(k)).join(' ') || 'nenhuma';
}

async function authClues(agent: CodeAgent, shell: string, cwd: string): Promise<string> {
  const bin = agent.binary.replace(/[^\w.-]/g, '');
  const line = [
    `echo "programa: $(command -v ${bin}) ($(${bin} --version 2>/dev/null | head -1))"`,
    `echo "variáveis: $(env | cut -d= -f1 | grep -iE '^(CLAUDE|ANTHROPIC|CODEX|OPENAI|CURSOR|DEVIN)' | tr '\\n' ' ')"`,
    `echo "shell: $SHELL · usuário: $USER · home: $HOME"`,
    `echo "no Orbi (não passadas ao agente): ${withheld()}"`,
    `[ -f "$HOME/.claude/.credentials.json" ] && echo "arquivo de login: ~/.claude/.credentials.json existe" || true`,
    `command -v security >/dev/null && (security find-generic-password -s "Claude Code-credentials" >/dev/null 2>&1 && echo "Keychain: login do Claude Code acessível" || echo "Keychain: login do Claude Code NÃO acessível daqui") || true`,
  ].join('; ');
  try {
    const r = await runShell(shell, line, { cwd, shell, timeoutMs: 20_000, inherit: 'developer' });
    return `\n\nO que o Orbi vê ao rodar o agente:\n${r.stdout.trim()}`;
  } catch {
    return '';
  }
}

export const TEST_PROMPT = 'Responda apenas com a palavra ok. Não leia nem altere arquivos.';

/**
 * Sends a short request to an agent, in an empty folder, to check it is installed, logged in and
 * answers in one-shot mode without waiting for a keypress. It costs a request on the agent's
 * account, so it runs only when the developer asks (Testar).
 */
export async function testAgent(
  agent: CodeAgent,
  opts: { model?: string | null; scratchDir: string; shell: string | null; env: Record<string, string | undefined>; timeoutMs?: number; open?: (script: string) => void },
): Promise<{ ok: boolean; detail: string }> {
  if (!opts.shell) return { ok: false, detail: 'nenhum shell encontrado (Git Bash no Windows): configure o caminho do bash.exe' };
  const dir = join(opts.scratchDir, 'agent-tests', ulid().toLowerCase());
  mkdirSync(dir, { recursive: true });
  const started = Date.now();
  try {
    const ran = await runAgent(agent, agentLine(agent.command, TEST_PROMPT, opts.model ?? null), {
      cwd: dir,
      title: `teste do ${agent.name}`,
      scratchDir: opts.scratchDir,
      shell: opts.shell,
      timeoutMs: opts.timeoutMs ?? (agent.runIn === 'window' ? 300_000 : 120_000),
      open: opts.open,
    });
    const secs = Math.round((Date.now() - started) / 1000);
    if (ran.timedOut) return { ok: false, detail: agent.runIn === 'window' ? `a janela do terminal não terminou em ${secs} s: veja se o agente está esperando login ou uma confirmação nela` : `não respondeu em ${secs} s: pode estar esperando login ou uma confirmação` };
    if (ran.exitCode !== 0) {
      const error = (ran.stderr || ran.stdout).trim().slice(-300);
      const why = /auth|login|oauth|credential|token|expired/i.test(error) ? await authClues(agent, opts.shell, dir) : '';
      return { ok: false, detail: `saiu com ${ran.exitCode}: ${error}${why}` };
    }
    return { ok: true, detail: `respondeu em ${secs} s${opts.model ? ` com ${opts.model}` : ''}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
