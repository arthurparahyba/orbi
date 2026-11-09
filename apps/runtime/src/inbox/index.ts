import type { InboxItem } from '../conversations/inbox.ts';
import type { InboxHandler } from './types.ts';
import { approval } from './approval.ts';
import { question } from './question.ts';
import { shellPath } from './shell.ts';
import { secret } from './secret.ts';
import { levelNote } from './level.ts';
import { codeChange } from './code-change.ts';

export type { InboxAction, InboxDeps, InboxHandler } from './types.ts';
export { NOT_THIS } from './types.ts';

/** Every kind of pending item. The first that matches wins: the more specific come first. */
export const HANDLERS: readonly InboxHandler[] = [shellPath, question, approval, secret, levelNote, codeChange];

export const handlerFor = (item: InboxItem, handlers: readonly InboxHandler[] = HANDLERS) => handlers.find((h) => h.matches(item));
