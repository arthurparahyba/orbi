/**
 * Scripts that belong to a procedure: Python the developer approves once (in the learning card),
 * kept in the brain with a name, and run by name with arguments (`run_script`). The same script
 * with other data is the same action, so it becomes "known" and runs by level, instead of a
 * `python3 -c` the model rewrites every time. Pure rules.
 */
import { createHash } from 'node:crypto';

export interface PlaybookScript {
  /** File-like name, e.g. gerar_html.py */
  name: string;
  /** What it does and which arguments it takes, in a line. */
  description: string;
  code: string;
  /** What it does to the world: changes this machine (default) or publishes outside. */
  effect?: 'local' | 'publica';
}

export const SCRIPT_NAME = /^[a-z0-9][a-z0-9_-]{0,47}\.py$/;
export const MAX_SCRIPT_BYTES = 50_000;
const SECRET = /\{\{\s*segredo:/i;

export function scriptProblems(scripts: PlaybookScript[] | undefined, steps: Array<{ id: string; how: string }>): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const s of scripts ?? []) {
    if (!SCRIPT_NAME.test(s.name ?? '')) problems.push(`nome de script inválido: ${s.name} (ex.: gerar_html.py)`);
    else if (names.has(s.name)) problems.push(`script repetido: ${s.name}`);
    names.add(s.name);
    if (!s.code?.trim()) problems.push(`script ${s.name} sem código`);
    else if (Buffer.byteLength(s.code) > MAX_SCRIPT_BYTES) problems.push(`script ${s.name} grande demais (máximo 50 KB): guarde dados em arquivo, não no código`);
    if (SECRET.test(s.code ?? '')) problems.push(`script ${s.name} cita uma credencial: credenciais não entram em scripts`);
    if (s.effect && s.effect !== 'local' && s.effect !== 'publica') problems.push(`efeito do script ${s.name} deve ser local ou publica`);
  }
  // A step that runs a script must name one the procedure has.
  for (const step of steps) {
    for (const m of step.how.matchAll(/run_script\s+([\w.-]+\.py)/g)) {
      if (!names.has(m[1])) problems.push(`passo ${step.id} usa o script ${m[1]}, que não está no procedimento`);
    }
  }
  return problems;
}

/** A short hash of the code: an edited script is a new action, approved again. */
export function scriptVersion(code: string): string {
  return createHash('sha256').update(code).digest('hex').slice(0, 10);
}
