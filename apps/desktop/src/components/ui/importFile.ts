import { createContext, useContext } from 'react';
import type { ProcedurePackage } from '../../api';

/**
 * Abrir o arquivo que a pessoa arrastou para cima da aplicação, ou escolheu no botão (documento
 * 30). Aqui só o bastante para dizer "isto não é um procedimento do Orbi" sem ida ao runtime —
 * a validação de verdade é lá, porque é lá que o arquivo vira procedimento.
 */

export interface Opened {
  pack: ProcedurePackage;
  fileName: string;
}

export interface Refused {
  refused: string;
}

/** O que um arquivo arrastado é. O nome do arquivo não decide nada: o conteúdo decide. */
export function readProcedureFile(fileName: string, text: string): Opened | Refused {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { refused: `${fileName} não é um procedimento do Orbi: não é nem um arquivo de texto com JSON dentro.` };
  }
  const pack = parsed as Partial<ProcedurePackage>;
  if (!pack || typeof pack !== 'object' || !pack.procedure?.name) {
    return { refused: `${fileName} é um JSON, mas não tem um procedimento dentro.` };
  }
  if (pack.orbi !== 1) {
    return { refused: `${fileName} é de uma versão do Orbi que esta não sabe ler (formato ${String(pack.orbi ?? 'nenhum')}). Peça um pacote gerado por uma versão mais nova.` };
  }
  return { pack: pack as ProcedurePackage, fileName };
}

/** O botão da tela de Procedimentos e o arrastar na janela entregam o arquivo no mesmo lugar. */
export const ImportContext = createContext<(file: File) => void>(() => {});
export const useImportProcedure = () => useContext(ImportContext);
