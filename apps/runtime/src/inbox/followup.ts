import type { InboxHandler } from './types.ts';

/** A follow-up that could not reach its conversation after every attempt: it only informs, until seen. */
export const followupFailed: InboxHandler = {
  id: 'retorno-que-falhou',
  matches: (item) => item.kind === 'followup',
  dismiss: (item, d) => ({ status: 200, body: d.inbox.resolve(item.id, 'answered', 'visto') }),
};
