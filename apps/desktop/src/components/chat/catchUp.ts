import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * After something is sent to a conversation from outside its composer (an answer to a question,
 * an approval, a message from the runtime), the Orbi works in a turn this screen did not start.
 * The live stream usually shows it. Where that stream is held back (an antivirus or a proxy
 * that buffers local connections), it only restarts after 90 s, and the screen looks stuck:
 * "I answered and nothing happened". This catches up without blinking: it checks every few
 * seconds and reloads only when nothing new arrived on its own.
 */

/** Local announcement: something was just sent to this conversation (no network involved). */
const bus = new EventTarget();
export function announceSent(conversationId: string): void {
  bus.dispatchEvent(new CustomEvent('sent', { detail: conversationId }));
}

export const FIRST_CHECK_MS = 3000;
export const MAX_WAIT_MS = 5 * 60_000;
/** 3 s, 4.5 s, 6.75 s… up to 10 s between checks. */
export const nextDelay = (ms: number) => Math.min(Math.round(ms * 1.5), 10_000);

/**
 * One check: what to do given whether the screen moved since the last check, whether the Orbi
 * is busy, and whether anything new arrived since the catch-up started.
 * - moved: the live stream is working, so just keep watching;
 * - nothing moved and the turn may still be running: reload;
 * - new content, idle and stable since the last reload: done.
 */
export function checkStep(s: { moved: boolean; busy: boolean; arrived: boolean; reloadedLast: boolean }): 'watch' | 'reload' | 'done' {
  if (s.moved) return 'watch';
  if (s.arrived && !s.busy && s.reloadedLast) return 'done';
  return 'reload';
}

/** Watches one conversation after something was sent to it. `signature` changes when its content does. */
export function useCatchUp({ id, refresh, busy, signature }: { id: string; refresh(): void | Promise<void>; busy: boolean; signature: string }) {
  const [since, setSince] = useState<number | undefined>();
  const sig = useRef(signature);
  sig.current = signature;
  const busyNow = useRef(busy);
  busyNow.current = busy;
  const start = useCallback(() => setSince(Date.now()), []);

  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === id) start(); };
    bus.addEventListener('sent', on);
    return () => bus.removeEventListener('sent', on);
  }, [id, start]);
  // Another conversation opened: stop watching this one.
  useEffect(() => setSince(undefined), [id]);

  useEffect(() => {
    if (since === undefined) return;
    const first = sig.current;
    let last = first;
    let reloadedLast = false;
    let delay = FIRST_CHECK_MS;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const now = sig.current;
      const step = Date.now() - since > MAX_WAIT_MS ? 'done' : checkStep({ moved: now !== last, busy: busyNow.current, arrived: now !== first, reloadedLast });
      last = now;
      if (step === 'done') return setSince(undefined);
      reloadedLast = step === 'reload';
      if (reloadedLast) await refresh();
      delay = nextDelay(delay);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, FIRST_CHECK_MS);
    return () => clearTimeout(timer);
  }, [since, refresh]);

  return { start, catchingUp: since !== undefined };
}
