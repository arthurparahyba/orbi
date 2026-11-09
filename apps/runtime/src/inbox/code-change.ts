import type { InboxHandler } from './types.ts';

/** A code fix the Orbi applied without asking (Pontos importantes): it only informs, until seen. */
export const codeChange: InboxHandler = {
  id: 'correcao-de-codigo',
  matches: (item) => item.kind === 'code-change',
  dismiss: (item, d) => ({ status: 200, body: d.inbox.resolve(item.id, 'answered', 'visto') }),
};
