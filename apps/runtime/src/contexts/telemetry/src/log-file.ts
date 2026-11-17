import { openSync, readSync, closeSync, fstatSync } from 'node:fs';

/**
 * Ler o fim do arquivo de log. Lê de trás para frente, em blocos, e para quando já tem linhas
 * suficientes: o arquivo cresce sem limite e ninguém quer carregar megabytes para mostrar as
 * últimas duzentas linhas.
 */

export interface Tail {
  text: string;
  /** Tamanho do arquivo, para a tela dizer de onde isto veio. */
  bytes: number;
  /** Verdadeiro quando o começo do arquivo não foi lido: a primeira linha pode estar cortada. */
  partial: boolean;
}

/** Não há arquivo: é o normal com `npm start`, em que a saída vai para o terminal. */
export interface NoFile {
  refused: 'sem-arquivo' | 'nao-deu-para-ler';
  detail: string;
}

const BLOCK = 64 * 1024;

export function tailOf(file: string, lines: number): Tail | NoFile {
  let fd: number | undefined;
  try {
    fd = openSync(file, 'r');
    const bytes = fstatSync(fd).size;
    let from = bytes;
    let text = '';
    // De trás para frente: cada bloco pode completar as linhas que faltam.
    while (from > 0 && count(text) <= lines) {
      const size = Math.min(BLOCK, from);
      from -= size;
      const buffer = Buffer.allocUnsafe(size);
      readSync(fd, buffer, 0, size, from);
      text = buffer.toString('utf8') + text;
    }
    return { text, bytes, partial: from > 0 };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code === 'ENOENT'
      ? { refused: 'sem-arquivo', detail: file }
      : { refused: 'nao-deu-para-ler', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const count = (text: string) => (text ? text.split('\n').length : 0);
