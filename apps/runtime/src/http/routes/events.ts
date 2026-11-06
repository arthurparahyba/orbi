import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ChangeEvent } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';

const HEARTBEAT_MS = 15_000;

/**
 * GET /api/events: a server-sent event per change (see @orbi/contracts
 * events.ts). Opens with `hello`, so a client refetches whatever it may have
 * missed while disconnected; a comment every 15 s keeps proxies from closing it.
 */
export function eventRoutes({ events }: OrbiServices, heartbeatMs = HEARTBEAT_MS) {
  return new Hono().get('/', (c) =>
    streamSSE(c, async (stream) => {
      const queue: ChangeEvent[] = [];
      let wake: (() => void) | undefined;
      const unsubscribe = events.subscribe((e) => { queue.push(e); wake?.(); });
      const beat = setInterval(() => { wake?.(); }, heartbeatMs);
      stream.onAbort(() => { unsubscribe(); clearInterval(beat); wake?.(); });

      await stream.writeSSE({ event: 'hello', data: '{}' });
      while (!stream.aborted) {
        if (!queue.length) {
          await new Promise<void>((resolve) => { wake = resolve; });
          wake = undefined;
          if (!queue.length && !stream.aborted) await stream.write(': ping\n\n');
        }
        for (const e of queue.splice(0)) await stream.writeSSE({ event: 'change', data: JSON.stringify(e) });
      }
      unsubscribe();
      clearInterval(beat);
    }),
  );
}
