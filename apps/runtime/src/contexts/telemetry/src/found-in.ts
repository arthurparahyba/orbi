import type { FoundIn } from '../../../language/index.ts';

/**
 * De qual chamada de ferramenta um dado veio (documento 28, fase C). Quem produziu a informação já
 * sabe de onde ela é: o terminal sabe o programa e os argumentos, o navegador sabe o endereço, o
 * arquivo sabe o caminho. Então a procedência é **derivada daqui**, e o modelo nunca a escolhe.
 *
 * Devolver nada é uma resposta: uma chamada que não traz informação nova do mundo (tirar uma foto
 * da página que já está aberta, pedir a lista de playbooks) deixa valendo a procedência anterior
 * da conversa — a foto é daquela página mesmo.
 */

const CLI = new Set(['run_command', 'run_readonly_command', 'run_shell', 'run_script', 'run_python']);

export function foundInOf(tool: string, args: Record<string, unknown>, at: string): FoundIn | undefined {
  if (CLI.has(tool)) {
    const command = commandOf(tool, args);
    return command ? { kind: 'cli', ref: command, at } : undefined;
  }
  if (tool.startsWith('browser')) {
    const url = urlOf(args);
    return url ? { kind: 'page', ref: url, at } : undefined;
  }
  if (tool === 'ask_developer') return { kind: 'screen', ref: 'o desenvolvedor respondeu na conversa', at };
  // `ask_secret` de propósito fora: o cofre guarda o valor, e nem o nome do segredo vira rastro.
  return undefined;
}

/** O comando como o desenvolvedor o leria, sem o que vier depois de um `|` ou `>`. */
function commandOf(tool: string, args: Record<string, unknown>): string {
  if (typeof args.binary === 'string') {
    const rest = Array.isArray(args.args) ? args.args.map(String) : [];
    return [args.binary, ...rest].join(' ').slice(0, 300);
  }
  for (const field of ['command', 'script', 'code']) {
    const value = args[field];
    if (typeof value === 'string' && value.trim()) return `${tool}: ${value.trim().split('\n')[0]!.slice(0, 200)}`;
  }
  return '';
}

/** O endereço, venha ele no corpo da chamada do navegador ou nos argumentos dela. */
function urlOf(args: Record<string, unknown>): string {
  const direct = args.url;
  if (typeof direct === 'string' && direct.startsWith('http')) return direct.slice(0, 500);
  const nested = args.args;
  if (nested && typeof nested === 'object') {
    const url = (nested as Record<string, unknown>).url;
    if (typeof url === 'string' && url.startsWith('http')) return url.slice(0, 500);
  }
  return '';
}
