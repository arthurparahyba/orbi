import type { Level } from './log.ts';

/**
 * Uma linha do arquivo vira registro. O logger do Orbi escreve JSON ou texto bonito, e o arquivo
 * tem mais do que isso: o que um plugin imprime, uma pilha de erro do Node, o que o Flue escreve.
 * Essas linhas **não são reconhecidas**, e isso é informação, não defeito — elas vêm marcadas
 * como `raw`, e quem for mandar algo para fora (uma issue) sabe que não pode confiar nelas.
 */

export interface LogLine {
  /** `orbi` quando veio do logger e todos os campos são conhecidos; `raw` quando não. */
  kind: 'orbi' | 'raw';
  at: string | null;
  level: Level | null;
  msg: string;
  /** Os atributos da linha, quando ela é do Orbi. */
  attrs: Record<string, unknown>;
}

const LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const PRETTY = /^(\d{2}:\d{2}:\d{2})\s+(DEBUG|INFO|WARN|ERROR)\s+(.*)$/;

export function parseLines(text: string): LogLine[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map(parseLine);
}

function parseLine(line: string): LogLine {
  if (line.startsWith('{')) {
    try {
      const { t, level, msg, ...attrs } = JSON.parse(line) as Record<string, unknown>;
      if (typeof msg === 'string' && typeof level === 'string' && LEVELS.has(level)) {
        return { kind: 'orbi', at: typeof t === 'string' ? t : null, level: level as Level, msg, attrs };
      }
    } catch {
      // JSON quebrado é linha crua como qualquer outra: não se adivinha o que ela é.
    }
  }
  const pretty = PRETTY.exec(line);
  if (pretty) {
    return { kind: 'orbi', at: pretty[1]!, level: pretty[2]!.toLowerCase() as Level, msg: pretty[3]!, attrs: {} };
  }
  return { kind: 'raw', at: null, level: null, msg: line, attrs: {} };
}

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Só o que foi pedido: do nível para cima, e contendo o texto. */
export function onlyAsked(lines: LogLine[], ask: { level?: Level; text?: string }): LogLine[] {
  const floor = ask.level ? ORDER[ask.level] : 0;
  const needle = ask.text?.toLowerCase();
  return lines.filter((l) => {
    // Linha crua não tem nível: um filtro de nível a esconde, porque não dá para afirmar que passa.
    if (floor > 0 && (!l.level || ORDER[l.level] < floor)) return false;
    if (!needle) return true;
    return l.msg.toLowerCase().includes(needle) || JSON.stringify(l.attrs).toLowerCase().includes(needle);
  });
}
