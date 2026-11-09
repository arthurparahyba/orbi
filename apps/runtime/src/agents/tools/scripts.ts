import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as v from 'valibot';
import { UiComponent } from '@orbi/contracts';
import { services } from '../../services.ts';
import { runCommand } from '../../terminal/exec.ts';
import { scriptVersion, type PlaybookScript } from '../../brain/domain/scripts.ts';
import { afterCommand, savePath, shortCommand } from './terminal.ts';
import type { AgentContext } from '../context.ts';

/**
 * run_script: runs one of the running procedure's own scripts (approved with the procedure)
 * by name, with arguments. Same script, other data → same action, so it becomes known and
 * runs by level instead of asking every time like a `python3 -c` rewritten each run.
 */

const SECRET = /\{\{\s*segredo:/i;

/** The script of the procedure running in this conversation, or why there is none. */
export function findScript(conversationId: string, name: string): { playbook: string; script: PlaybookScript } | { problem: string } {
  const { brain } = services();
  const run = brain.openRunIn(conversationId);
  if (!run) return { problem: 'run_script só roda dentro de um procedimento em andamento (playbook_start antes).' };
  const pb = brain.playbook(run.playbook);
  const script = pb?.scripts.find((s) => s.name === name);
  if (!script) {
    const names = pb?.scripts.map((s) => s.name).join(', ') || 'nenhum';
    return { problem: `O procedimento ${run.playbook} não tem o script ${name} (tem: ${names}). Para criar ou mudar um script, proponha com brain_learn.` };
  }
  return { playbook: run.playbook, script };
}

const input = v.object({
  script: v.pipe(v.string(), v.description('Name of one of the running procedure\'s scripts, e.g. gerar_html.py')),
  args: v.pipe(v.array(v.string()), v.description('Arguments the script reads from sys.argv (data, paths)')),
  purpose: v.pipe(v.string(), v.description('One line: why you run this. Shown to the developer.')),
  saveTo: v.optional(v.pipe(v.string(), v.description('Write the whole output to this file instead of returning it'))),
  show: v.optional(v.pipe(v.boolean(), v.description('The script prints one component (JSON: table, status, link or code): it goes straight to the conversation, without you copying it. Use it to show tables.'))),
  timeoutSeconds: v.optional(v.number()),
});

export function useScripts(ctx: AgentContext) {
  const version = (name: string) => {
    const found = findScript(ctx.conversationId, name);
    return 'script' in found ? `${found.playbook}/${name}@${scriptVersion(found.script.code).slice(0, 8)}` : name;
  };
  ctx.gated({
    name: 'run_script',
    description:
      'Run one of the running procedure\'s own Python scripts by name, with arguments. Prefer it to python3 -c for anything a step repeats: ' +
      'the script was approved with the procedure, so the same script becomes a known action.',
    input,
    precheck: (a) => {
      const problems: string[] = [];
      const found = findScript(ctx.conversationId, a.script);
      if ('problem' in found) problems.push(found.problem);
      if (a.args.some((x) => SECRET.test(x))) problems.push('Credenciais não vão em argumentos de script.');
      return problems;
    },
    category: () => 'comandos-escrita',
    effect: (a) => {
      const found = findScript(ctx.conversationId, a.script);
      return 'script' in found && found.script.effect === 'publica' ? 'publica' : 'local';
    },
    summary: (a) => `${a.purpose}: ${a.script} ${a.args.join(' ')}`,
    title: (a) => a.purpose,
    command: (a) => `${shortCommand(a.script, a.args)}${a.saveTo ? ` > ${shortCommand('', [a.saveTo]).trim()}` : ''}`,
    // The version is in the fingerprint: an edited script is a new action, approved again.
    fingerprint: (a) => `run_script ${version(a.script)} ${a.args.join(' ')}${a.saveTo ? ` > ${a.saveTo}` : ''}`,
    execute: async (a) => {
      const found = findScript(ctx.conversationId, a.script);
      if ('problem' in found) return JSON.stringify({ error: found.problem });
      const { config } = services();
      const file = join(config.scratchDir, 'scripts', found.playbook, `${scriptVersion(found.script.code)}-${found.script.name}`);
      if (!existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, found.script.code);
      }
      const save = a.saveTo ? savePath(a.saveTo, config.workspace) : undefined;
      const result = await runCommand('python3', [file, ...a.args], {
        cwd: config.workspace,
        timeoutMs: Math.min(a.timeoutSeconds ?? 120, 1800) * 1000,
        env: config.cliEnv,
        allowed: ['python3'],
        shell: config.shell,
        ...(save ? { maxOutput: 50_000_000 } : {}),
      });
      const shown = { ...result, command: shortCommand(a.script, a.args) };
      const extra = afterCommand(ctx.conversationId, shown.command, result);
      if (a.show) return showOutput(ctx, result, shown.command, extra);
      if (!save) return JSON.stringify({ ...shown, ...extra });
      const ok = result.exitCode === 0 && !result.timedOut;
      if (ok) {
        mkdirSync(dirname(save), { recursive: true });
        writeFileSync(save, result.stdout);
      }
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      return JSON.stringify({ command: shown.command, exitCode: result.exitCode, savedTo: ok ? save : null, lines: lines.length, head: lines.slice(0, 5), stderr: result.stderr.slice(0, 2000), timedOut: result.timedOut, ...extra });
    },
    timeoutMs: 1_800_000,
  });
}

/**
 * `show`: the script's output is a component, shown as it is. The data never passes through
 * the model (copying a 20-row table by hand is where it slipped: show_ui with empty arguments).
 */
export function showOutput(ctx: Pick<AgentContext, 'ui'>, result: { exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean }, command: string, extra: object = {}): string {
  if (result.exitCode !== 0 || result.timedOut) return JSON.stringify({ command, exitCode: result.exitCode, stderr: result.stderr.slice(0, 2000), timedOut: result.timedOut, ...extra });
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${command}: a saída não é JSON; com show, o script imprime um componente (ex.: {"component":"table","id":"…","title":"…","columns":[…],"rows":[[…]]})`);
  }
  const component = v.safeParse(UiComponent, parsed);
  if (!component.success) {
    throw new Error(`${command}: a saída não é um componente válido: ${component.issues.slice(0, 3).map((i) => `${i.path?.map((p) => p.key).join('.') ?? ''} ${i.message}`).join('; ')}`);
  }
  ctx.ui(component.output);
  const c = component.output;
  return JSON.stringify({ command, shown: c.component, id: c.id, ...(c.component === 'table' ? { rows: c.rows.length } : {}) });
}
