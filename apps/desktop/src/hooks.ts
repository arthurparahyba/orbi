import { useCallback, useEffect, useRef, useState } from 'react';
import type { Topic } from '@orbi/contracts';
import { RUNTIME_URL } from './api';
import { concerns, createLive, type Change, type Live } from './live';

let live: Live | undefined;
/** The app's single connection to the change feed (EventSource reconnects by itself). */
function feed(): Live {
  live ??= createLive(() => new EventSource(`${RUNTIME_URL}/api/events`));
  return live;
}

/**
 * Loads data and keeps the last good value on errors. `reload()` never runs
 * two loads at once: a call during a load schedules exactly one more after it.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const loadRef = useRef(load);
  loadRef.current = load;
  const state = useRef({ running: false, again: false });

  const reload = useCallback(async () => {
    const s = state.current;
    if (s.running) { s.again = true; return; }
    s.running = true;
    try {
      do {
        s.again = false;
        try {
          setData(await loadRef.current());
          setError(undefined);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } while (s.again);
    } finally {
      s.running = false;
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload, ...deps]);
  return { data, error, reload };
}

/** Calls `onChange` for every change the runtime announces (and on reconnection). */
export function useChanges(onChange: (change: Change) => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => feed().subscribe((c) => ref.current(c)), []);
}

/** Data that follows the runtime: loaded once, then again whenever one of `topics` changes. */
export function useLive<T>(load: () => Promise<T>, topics: readonly Topic[], deps: unknown[] = []) {
  const q = useLoad(load, deps);
  useChanges((c) => { if (concerns(c, topics)) void q.reload(); });
  return q;
}

/** For what has no event (the runtime's own health): load now and every `ms`. */
export function usePoll<T>(load: () => Promise<T>, ms: number) {
  const q = useLoad(load);
  useEffect(() => {
    const timer = setInterval(() => void q.reload(), ms);
    return () => clearInterval(timer);
  }, [ms, q.reload]);
  return q;
}
