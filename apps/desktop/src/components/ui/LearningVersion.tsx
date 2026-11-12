import type { InboxItem } from '@orbi/contracts';
import { LearningPreview } from './LearningPreview';
import { learningChanges } from './learningChanges';

/**
 * A learning card's body (docs/funcionalidades/21): the proposal as it is now (changed in the
 * card's conversation, the inbox has the current one), what changed in the conversation marked
 * in green, and why. No version numbers on screen.
 */
export function LearningVersion({ detail, why, item }: { detail: string; why?: string; item?: InboxItem }) {
  const changedInChat = !!item?.version && item.version > 1;
  const current = changedInChat ? item!.detail : detail;
  const first = item?.versions?.[0]?.detail;
  const changes = changedInChat && first ? learningChanges(first, current) : [];
  const reason = whyOf(current) ?? why;
  return (
    <>
      <LearningPreview detail={current} />
      {changes.length > 0 && (
        <div className="card-changes">
          <span className="ui-kicker">Mudou na conversa</span>
          <ul>{changes.map((c, i) => <li key={i}><strong>{c.where}</strong>{c.text && <> · {c.text}</>}</li>)}</ul>
        </div>
      )}
      {reason && <p className="card-why"><strong>Por quê:</strong> {reason}</p>}
    </>
  );
}

/** The why travels inside the stored call too: the current proposal's wins. */
function whyOf(detail: string): string | undefined {
  try {
    const w = (JSON.parse(detail) as { why?: unknown }).why;
    return typeof w === 'string' && w.trim() ? w.trim() : undefined;
  } catch {
    return undefined;
  }
}
