import { createContext } from 'react';
import type { InboxItem } from '@orbi/contracts';

/** What the cards can do with a pending item (App provides it). */
export interface InboxActions {
  items: Map<string, InboxItem>;
  decide(id: string, decision: 'approve' | 'deny'): Promise<void>;
  answer(id: string, text: string): Promise<void>;
}
export const InboxContext = createContext<InboxActions>({ items: new Map(), decide: async () => {}, answer: async () => {} });

export const CATEGORY_LABEL: Record<string, string> = {
  'comandos-leitura': 'Comando de leitura',
  // Any command not known to only read: it may change something, or the Orbi just could not tell.
  'comandos-escrita': 'Executar comando',
  'navegador-leitura': 'Navegador (leitura)',
  'navegador-escrita': 'Ação no navegador',
  'codigo-teste': 'Correção só em teste',
  'codigo-producao': 'Correção em código de produção',
  aprender: 'Aprendizado para o cérebro',
};

