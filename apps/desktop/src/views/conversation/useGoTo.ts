import { useEffect, useRef, type RefObject } from 'react';

const HIGHLIGHT_MS = 2600;

/**
 * "Ir até" from Pendências: scrolls the conversation to the card of that item and highlights it.
 * The card may not be drawn yet (the conversation just opened), so it tries again as messages
 * arrive, for a few seconds.
 */
export function useGoTo(box: RefObject<HTMLDivElement | null>, target: { inboxId: string; n: number } | undefined, drawn: number) {
  const done = useRef<number>(0);
  const since = useRef<number>(0);
  useEffect(() => {
    if (!target || done.current === target.n) return;
    if (since.current === 0) since.current = Date.now();
    const find = () => box.current?.querySelector<HTMLElement>(`[data-inbox="${CSS.escape(target.inboxId)}"]`);
    const go = () => {
      const el = find();
      if (!el) return Date.now() - since.current > 5000;
      // Instant: the scroll event right away tells the conversation to stop following the bottom.
      el.scrollIntoView({ block: 'center' });
      el.classList.add('is-target');
      globalThis.setTimeout(() => el.classList.remove('is-target'), HIGHLIGHT_MS);
      return true;
    };
    if (go()) {
      done.current = target.n;
      since.current = 0;
      return;
    }
    const retry = globalThis.setTimeout(() => { if (go()) { done.current = target.n; since.current = 0; } }, 400);
    return () => globalThis.clearTimeout(retry);
  }, [box, target, drawn]);
}
