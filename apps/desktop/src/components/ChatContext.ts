import { createContext } from 'react';

/** Lets a card in the conversation speak for the developer (e.g. "Não é isso?"). */
export const ChatContext = createContext<{ send(text: string): void }>({ send: () => {} });
