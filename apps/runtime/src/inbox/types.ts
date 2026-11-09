import type { InboxItem } from '../conversations/inbox.ts';
import type { OrbiServices } from '../services.ts';
import type { Agent } from '../http/routes/types.ts';

/**
 * What one kind of pending item does when the developer acts on it in Pendências or on its card.
 * One handler per kind (or per routine of a kind), in index.ts: a new kind of item is a new
 * handler; the routes only find the handler and call the action.
 */
export type InboxDeps = Pick<OrbiServices, 'inbox' | 'events' | 'vault' | 'brain' | 'pipelines'> & { agent: Agent };

/** An action's result: the HTTP status and the body (a dispatch receipt, or the resolved item). */
export interface ActionResult { status: 200 | 202; body: unknown }

export interface InboxHandler {
  id: string;
  matches(item: InboxItem): boolean;
  /** Approve or deny. */
  decide?(item: InboxItem, input: { decision: 'approve' | 'deny'; approver: string }, d: InboxDeps): Promise<ActionResult>;
  /** Answer a question. */
  answer?(item: InboxItem, text: string, d: InboxDeps): Promise<ActionResult>;
  /** Give a credential (it goes to the vault only). */
  secret?(item: InboxItem, input: { name: string; value?: string; description?: string }, d: InboxDeps): Promise<ActionResult>;
  /** Undo the automatic change a note is about. */
  keep?(item: InboxItem, d: InboxDeps): ActionResult;
  /** Seen. */
  dismiss?(item: InboxItem, d: InboxDeps): ActionResult;
}

export type InboxAction = 'decide' | 'answer' | 'secret' | 'keep' | 'dismiss';

/** What the developer is told when an item does not take an action. */
export const NOT_THIS: Record<InboxAction, string> = {
  decide: 'este item não é uma aprovação',
  answer: 'este item não é uma pergunta',
  secret: 'este item não pede credencial',
  keep: 'este aviso não tem o que manter',
  dismiss: 'só avisos podem ser dispensados',
};
