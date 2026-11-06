import type { ChangeEvent, Topic } from '@orbi/contracts';

export type { ChangeEvent, Topic };

/**
 * What changed in Orbi, for whoever is listening (the app, via GET /api/events).
 * Changes in the same tick are coalesced: a transaction that writes ten rows
 * of the brain produces one `brain` event.
 */
export interface Events {
  emit(topic: Topic, id?: string): void;
  /** Returns the function that stops listening. */
  subscribe(listener: (event: ChangeEvent) => void): () => void;
}

export function createEvents(): Events {
  const listeners = new Set<(event: ChangeEvent) => void>();
  const pending = new Map<string, ChangeEvent>();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const batch = [...pending.values()];
    pending.clear();
    for (const event of batch) {
      for (const listener of listeners) {
        try { listener(event); } catch { /* one bad listener doesn't stop the others */ }
      }
    }
  };

  return {
    emit(topic, id) {
      pending.set(`${topic}\u0000${id ?? ''}`, id === undefined ? { topic } : { topic, id });
      if (!scheduled) { scheduled = true; setImmediate(flush); }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
