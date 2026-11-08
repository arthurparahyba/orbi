import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isNearBottom } from './scroll';

/**
 * Keeps the messages at the bottom only while the reader is there. Scrolled up to read
 * older messages: nothing moves, and `unread` turns on when something new arrives.
 * Opening a conversation, or sending, goes to the bottom.
 */
export function useFollowBottom(conversationId: string, key: string) {
  const box = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [unread, setUnread] = useState(false);

  const toBottom = useCallback(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
    setUnread(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = box.current;
    if (!el) return;
    following.current = isNearBottom(el);
    if (following.current) setUnread(false);
  }, []);

  useLayoutEffect(() => { toBottom(); }, [conversationId, toBottom]);

  // Cards fill in after the list arrives (and text streams in): while following, stay at the bottom.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const watch = new MutationObserver(() => { if (following.current) el.scrollTop = el.scrollHeight; });
    watch.observe(el, { childList: true, subtree: true, characterData: true });
    return () => watch.disconnect();
  }, [conversationId]);

  useEffect(() => {
    if (following.current) {
      const el = box.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else setUnread(true);
  }, [key]);

  return { box, onScroll, unread, toBottom };
}
