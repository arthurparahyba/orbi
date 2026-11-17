import type { OrbiServices } from '../../../services.ts';
import { redact } from '../../secrets/index.ts';
import { tailOf, type NoFile } from '../src/log-file.ts';
import { onlyAsked, parseLines, type LogLine } from '../src/log-lines.ts';
import type { Level } from '../src/log.ts';

/**
 * O fim do registro do runtime, para a tela mostrar. O log existe desde sempre e ninguém o
 * enxergava sem abrir o arquivo à mão: quando o Orbi falhava, a aplicação mostrava um círculo
 * girando e a resposta estava escrita num `.log`.
 *
 * Credencial não deveria estar no log — é regra do projeto — mas o que um plugin imprime e o que
 * vem numa pilha de erro não passam pelo logger do Orbi. Então o texto é limpo por `redact` antes
 * de ser interpretado, como defesa em profundidade. Isso não é licença para registrar segredo.
 */

export interface RecentLog {
  /** De onde veio, para a tela dizer e o desenvolvedor achar. */
  file: string;
  bytes: number;
  /** A primeira linha pode estar cortada: o arquivo foi lido do fim. */
  partial: boolean;
  lines: LogLine[];
  /** Quantas linhas o Orbi não reconheceu (plugin, pilha de erro, outro programa). */
  raw: number;
}

export type { NoFile };

type Deps = Pick<OrbiServices, 'config' | 'vault'>;

const DEFAULT_LIMIT = 200;

export async function recentLog(d: Deps, ask: { level?: Level; text?: string; limit?: number } = {}): Promise<RecentLog | NoFile> {
  const limit = Math.min(Math.max(ask.limit ?? DEFAULT_LIMIT, 1), 2000);
  // Mais linhas do que o pedido, porque o filtro vai descartar parte delas.
  const tail = tailOf(d.config.logFile, limit * 4);
  if ('refused' in tail) return tail;

  const secrets = (await Promise.all(d.vault.list().map((x) => d.vault.get(x.name)))).filter((x): x is string => !!x);
  const lines = parseLines(redact(tail.text, secrets));
  const asked = onlyAsked(lines, ask).slice(-limit);

  return { file: d.config.logFile, bytes: tail.bytes, partial: tail.partial, lines: asked, raw: asked.filter((l) => l.kind === 'raw').length };
}
