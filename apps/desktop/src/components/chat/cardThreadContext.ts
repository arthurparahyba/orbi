import { createContext } from 'react';
import type { FlueConversationMessage } from '@flue/react';

/** What a card needs to show and continue its own conversation (ChatPanel provides it). */
export interface CardThreadActions {
  threads: Map<string, FlueConversationMessage[]>;
  /** The Orbi is answering (a card's question waits for it like any turn). */
  busy: boolean;
  send(card: string, title: string, context: string, text: string): Promise<void>;
}
export const CardThreadContext = createContext<CardThreadActions | undefined>(undefined);
