import { useState } from 'react';
import type { InboxItem } from '@orbi/contracts';
import { LearningPreview } from './LearningPreview';

/**
 * A learning card's body (docs/funcionalidades/21): why, and the version on screen. Changed in the
 * card's conversation, it shows the current version from the inbox, "atualizado na conversa ·
 * versão N" and the earlier one a click away.
 */
export function LearningVersion({ detail, why, item }: { detail: string; why?: string; item?: InboxItem }) {
  const [before, setBefore] = useState(false);
  const current = item?.version && item.version > 1 ? item.detail : detail;
  const previous = item?.versions?.at(-1);
  const reason = whyOf(current) ?? why;
  return (
    <>
      {item?.version && item.version > 1 && (
        <p className="card-version small">
          <span className="version-tag">atualizado na conversa · versão {item.version}</span>
          {previous && <button type="button" className="link-btn small" onClick={() => setBefore((b) => !b)} aria-expanded={before}>{before ? 'esconder como era' : 'ver como era'}</button>}
        </p>
      )}
      {before && previous && <div className="card-before"><p className="muted small">Versão {item!.version! - 1}</p><LearningPreview detail={previous.detail} /></div>}
      <LearningPreview detail={current} />
      {reason && <p className="card-why"><strong>Por quê:</strong> {reason}</p>}
    </>
  );
}

/** The why travels inside the stored call too: the current version's wins. */
function whyOf(detail: string): string | undefined {
  try {
    const w = (JSON.parse(detail) as { why?: unknown }).why;
    return typeof w === 'string' && w.trim() ? w.trim() : undefined;
  } catch {
    return undefined;
  }
}
