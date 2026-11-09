import { HttpError, notFound } from '../http/errors.ts';
import type { InboxItem } from '../conversations/inbox.ts';
import type { InboxHandler } from './types.ts';

/** What a note's routine is about: a procedure's level, or an esteira's passage. */
export type NoteSubject = { kind: 'playbook'; name: string } | { kind: 'passage'; key: string };

/** `playbook:<name>` · `passage:<pipeline>/<stage>` (the strings stored with the note). */
export function noteSubject(item: Pick<InboxItem, 'routine'>): NoteSubject | undefined {
  const r = item.routine ?? '';
  const at = r.indexOf(':');
  if (at < 0) return undefined;
  const [kind, rest] = [r.slice(0, at), r.slice(at + 1)];
  if (kind === 'playbook') return { kind, name: rest };
  if (kind === 'passage') return { kind, key: rest };
  return undefined;
}

/** A note (a level or a passage changed on its own): seen, or "Manter" to undo the change. */
export const levelNote: InboxHandler = {
  id: 'aviso',
  matches: (item) => item.kind === 'level',
  dismiss: (item, d) => ({ status: 200, body: d.inbox.resolve(item.id, 'answered', 'ok') }),
  keep(item, d) {
    const subject = noteSubject(item);
    if (!subject || !item.approvalId) throw new HttpError(409, 'conflict', 'este aviso não tem o que manter');
    if (subject.kind === 'playbook') {
      if (!d.brain.playbook(subject.name)) throw notFound('playbook');
      // approvalId keeps the level from before the change.
      d.brain.setPlaybookLevel(subject.name, { level: Number(item.approvalId) as 1 | 2 | 3 }, item.conversationId);
    } else {
      d.pipelines.engine.keepAsking(subject.key, item.conversationId);
    }
    return { status: 200, body: d.inbox.resolve(item.id, 'answered', 'mantido') };
  },
};
