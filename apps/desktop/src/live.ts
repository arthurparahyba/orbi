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
 */
export type Change = ChangeEvent | { topic: 'hello' };
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
  fallback: { everyMs: number; setInterval: typeof setInterval; clearInterval: typeof clearInterval } = { everyMs: 5_000, setInterval, clearInterval },
): Live {
  const listeners = new Set<Listener>();
  let source: EventSourceLike | undefined;
  let up = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const send = (change: Change) => {
    for (const listener of listeners) listener(change);
  };
  const connect = () => {
    source = open();
    up = false;
    timer ??= fallback.setInterval(() => { if (!up) send({ topic: 'hello' }); }, fallback.everyMs);
    source.addEventListener('hello', () => { up = true; send({ topic: 'hello' }); });
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

/** Whether a change concerns a screen that shows `topics` (optionally one item). */
export function concerns(change: Change, topics: readonly Topic[], id?: string): boolean {
  if (change.topic === 'hello') return true;
  if (!topics.includes(change.topic)) return false;
  return id === undefined || change.id === undefined || change.id === id;
}
