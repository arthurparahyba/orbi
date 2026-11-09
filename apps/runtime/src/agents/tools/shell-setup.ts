import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { services } from '../../services.ts';
import { setEnvValue } from '../../settings/env-file.ts';
import type { UiComponent } from '@orbi/contracts';

/**
 * No shell was found and a command needs one (run_shell, or npm/mvn on Windows): instead of an
 * error the developer cannot act on, a card asks where Git Bash is. The answer is checked,
 * written to the .env (ORBI_SHELL) and used at once, without a restart (routes/inbox.ts).
 */
export const SHELL_ROUTINE = 'config:shell';

const SUGGESTIONS = process.platform === 'win32'
  ? ['C:\\Program Files\\Git\\bin\\bash.exe', `${process.env.LOCALAPPDATA ?? 'C:\\Users\\<você>\\AppData\\Local'}\\Programs\\Git\\bin\\bash.exe`]
  : ['/bin/bash', '/usr/local/bin/bash'];

/** Asks once per conversation (an open card is not asked again). */
export function askShellPath(conversationId: string, ui: (c: UiComponent) => void): string {
  const { inbox } = services();
  const open = inbox.list({ status: 'open' }).find((i) => i.routine === SHELL_ROUTINE && i.conversationId === conversationId);
  if (!open) {
    const question = process.platform === 'win32' ? 'Onde está o Git Bash (bash.exe)? Preciso dele para rodar este comando.' : 'Onde está o bash? Preciso dele para rodar este comando.';
    const item = inbox.add({ kind: 'question', conversationId, title: question, detail: SUGGESTIONS.join('\n'), routine: SHELL_ROUTINE });
    ui({ component: 'question', id: `q-${item.id}`, question, options: SUGGESTIONS, inboxId: item.id });
  }
  return 'Este comando precisa do Git Bash, que não foi encontrado. Pedi o caminho ao desenvolvedor num cartão na conversa: espere a resposta (chega como sinal) e então rode o comando de novo. Não tente outro jeito.';
}

/** The developer's answer: a bash that exists becomes the shell, now and after a restart. */
export function saveShellPath(answer: string): { path: string } | { problem: string } {
  const path = resolve(answer.trim().replace(/^["']|["']$/g, ''));
  if (!existsSync(path) || !statSync(path).isFile()) return { problem: `não achei ${path}. Confira o caminho do bash.exe (fica em Git\\bin dentro da pasta onde o Git for Windows foi instalado).` };
  if (!/bash(\.exe)?$/i.test(path)) return { problem: `${path} não parece ser o bash (o arquivo se chama bash.exe).` };
  const { config } = services();
  setEnvValue(resolve(config.cwd, '.env'), 'ORBI_SHELL', path);
  config.shell = path;
  return { path };
}
