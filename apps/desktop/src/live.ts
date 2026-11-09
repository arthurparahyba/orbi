import { TOPICS, type ChangeEvent, type Topic } from '@orbi/contracts';

/**
 * The runtime's change feed (GET /api/events, see @orbi/contracts events.ts).
 * One connection for the whole app; screens subscribe to the topics they show
 * and refetch when one changes. `hello` (every (re)connection) reaches every
 * subscriber, so nothing missed while offline stays stale.
 *
 * If the feed is not up (no `hello` yet, or it errored), a fallback sends a
 * `hello` every few seconds, so screens keep refreshing until it is: some
 * webviews drop or never open the stream, and the app must not go stale.
 *
 * A `hello` says why it came: the first connection, a reconnection (something may
 * have been missed: worth catching up even on heavy screens) or a fallback tick
 * (cheap screens reload; a reload that brings the same data changes nothing).
 */
export type Hello = { topic: 'hello'; why: 'first' | 'reconnect' | 'fallback' };
export type Change = ChangeEvent | Hello;
export type Listener = (change: Change) => void;

/** The part of EventSource we use (a fake one in tests). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (e: { data: string }) => void): void;
  close(): void;
}

export interface Live {
  subscribe(listener: Listener): () => void;
  close(): void;
}

export function createLive(
  open: () => EventSourceLike,
  // Wrapped: browsers throw "Illegal invocation" when setInterval is called as a method of another object.
  fallback: { everyMs: number; setInterval(fn: () => void, ms: number): unknown; clearInterval(id: unknown): void } = {
    everyMs: 5_000,
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (id) => globalThis.clearInterval(id as number),
  },
): Live {
  const listeners = new Set<Listener>();
  let source: EventSourceLike | undefined;
  let up = false;
  let connected = false;
  let timer: unknown;

  const send = (change: Change) => {
    for (const listener of listeners) listener(change);
  };
  const connect = () => {
    source = open();
    up = false;
    timer ??= fallback.setInterval(() => { if (!up) send({ topic: 'hello', why: 'fallback' }); }, fallback.everyMs);
    source.addEventListener('hello', () => {
      up = true;
      send({ topic: 'hello', why: connected ? 'reconnect' : 'first' });
      connected = true;
    });
    source.addEventListener('error', () => { up = false; });
    source.addEventListener('change', (e) => {
      try {
        const change = JSON.parse(e.data) as ChangeEvent;
        if ((TOPICS as readonly string[]).includes(change.topic)) send(change);
      } catch {
        /* malformed event: ignore */
      }
    });
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!source) connect();
      return () => listeners.delete(listener);
    },
    close() {
      source?.close();
      source = undefined;
      if (timer !== undefined) fallback.clearInterval(timer);
      timer = undefined;
    },
  };
}

/**
 * Whether a reload brought something new. Same data (the usual case for a health check
 * or a fallback tick) must not re-render the screen: that is what makes things blink.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Whether a change concerns a screen that shows `topics` (optionally one item). */
export function concerns(change: Change, topics: readonly Topic[], id?: string): boolean {
  if (change.topic === 'hello') return true;
  if (!topics.includes(change.topic)) return false;
  return id === undefined || change.id === undefined || change.id === id;
}
