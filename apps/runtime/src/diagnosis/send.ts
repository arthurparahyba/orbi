import { CommandNotFoundError, runCommand, type RunResult } from '../terminal/exec.ts';
import { issueUrl, type IssueDraft } from './issue.ts';

/** Como a issue saiu: pelo `gh` desta máquina, ou pela página do GitHub para você clicar. */
export interface Sent {
  via: 'gh' | 'browser';
  url: string;
  /** Já existia uma issue com a mesma impressão digital: entrou como ocorrência nela. */
  commented?: boolean;
  /** Por que não foi pelo `gh` (não está instalado, não está logado, deu erro). */
  why?: string;
}

/** O `gh` desta máquina. Trocável no teste, para não depender de rede nem de login. */
export type Gh = (args: readonly string[]) => Promise<Pick<RunResult, 'exitCode' | 'stdout' | 'stderr'>>;
const ghHere: Gh = (args) => runCommand('gh', args, { allowed: ['gh'], timeoutMs: 30_000 });
const firstUrl = (text: string) => /https:\/\/github\.com\/[^\s"']+/.exec(text)?.[0];

/**
 * Manda a issue (docs/funcionalidades/24). Primeiro pelo `gh` desta máquina, que é quem já está
 * logado: se a mesma impressão digital já tem issue aberta, entra como ocorrência nela em vez de
 * abrir outra. Sem `gh`, ou se ele falhar, devolve a página do GitHub já preenchida para o
 * desenvolvedor conferir e enviar — nunca fica sem caminho.
 */
export async function sendIssue(repo: string, draft: IssueDraft, gh: Gh = ghHere): Promise<Sent> {
  const fallback = (why: string): Sent => ({ via: 'browser', url: issueUrl(repo, draft), why });
  try {
    const found = await gh(['issue', 'list', '--repo', repo, '--search', draft.fingerprint, '--state', 'all', '--limit', '1', '--json', 'number,url']);
    if (found.exitCode !== 0) return fallback(ghWhy(found.stderr));
    const [issue] = JSON.parse(found.stdout || '[]') as Array<{ number: number; url: string }>;
    if (issue) {
      const note = await gh(['issue', 'comment', String(issue.number), '--repo', repo, '--body', `Aconteceu de novo.\n\n${draft.body}`]);
      if (note.exitCode !== 0) return fallback(ghWhy(note.stderr));
      return { via: 'gh', url: firstUrl(note.stdout) ?? issue.url, commented: true };
    }
    const made = await gh(['issue', 'create', '--repo', repo, '--title', draft.title, '--body', draft.body]);
    if (made.exitCode !== 0) return fallback(ghWhy(made.stderr));
    return { via: 'gh', url: firstUrl(made.stdout) ?? `https://github.com/${repo}/issues` };
  } catch (error) {
    if (error instanceof CommandNotFoundError) return fallback('o `gh` não está instalado nesta máquina');
    return fallback(`o \`gh\` falhou: ${String(error).replace(/\s+/g, ' ').slice(0, 160)}`);
  }
}

/** O que dizer ao desenvolvedor quando o `gh` recusa (quase sempre é login). */
function ghWhy(stderr: string): string {
  const text = stderr.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (/auth|login|token/i.test(text)) return `o \`gh\` não está logado (${text}); rode \`gh auth login\` ou envie pela página`;
  return `o \`gh\` falhou: ${text || 'sem mensagem'}`;
}
