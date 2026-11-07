import { describe, expect, it } from 'vitest';
import { concerns, createLive, type Change, type EventSourceLike } from '../src/live';

/** An EventSource we drive by hand. */
function fakeSource() {
  const handlers = new Map<string, Array<(e: { data: string }) => void>>();
  let opened = 0;
  let closed = 0;
  const source: EventSourceLike = {
    addEventListener: (type, fn) => handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    close: () => { closed++; },
  };
  return {
    open: () => { opened++; return source; },
    fire: (type: string, data = '{}') => handlers.get(type)?.forEach((fn) => fn({ data })),
    get opened() { return opened; },
    get closed() { return closed; },
  };
}

describe('createLive', () => {
  it('abre uma conexão só no primeiro inscrito e repassa as mudanças', () => {
    const src = fakeSource();
    const live = createLive(src.open);
    expect(src.opened).toBe(0);
    const a: Change[] = [];
    const b: Change[] = [];
    live.subscribe((c) => a.push(c));
    const stopB = live.subscribe((c) => b.push(c));
    expect(src.opened).toBe(1);

    src.fire('hello');
    src.fire('change', JSON.stringify({ topic: 'inbox', id: 'x' }));
    stopB();
    src.fire('change', JSON.stringify({ topic: 'brain' }));
    expect(a).toEqual([{ topic: 'hello' }, { topic: 'inbox', id: 'x' }, { topic: 'brain' }]);
    expect(b).toEqual([{ topic: 'hello' }, { topic: 'inbox', id: 'x' }]);
    live.close();
    expect(src.closed).toBe(1);
  });

  it('ignora eventos malformados ou de tópico desconhecido', () => {
    const src = fakeSource();
    const seen: Change[] = [];
    createLive(src.open).subscribe((c) => seen.push(c));
    src.fire('change', 'não é json');
    src.fire('change', JSON.stringify({ topic: 'outra-coisa' }));
    expect(seen).toEqual([]);
  });
});

describe('createLive sem o feed', () => {
  it('enquanto não chega hello (ou depois de erro), manda hello de tempos em tempos', () => {
    const src = fakeSource();
    let tick: () => void = () => {};
    const live = createLive(src.open, { everyMs: 5000, setInterval: ((fn: () => void) => { tick = fn; return 1; }) as never, clearInterval: (() => {}) as never });
    const seen: Change[] = [];
    live.subscribe((c) => seen.push(c));
    tick();
    expect(seen).toEqual([{ topic: 'hello' }]);
    src.fire('hello');
    tick();
    expect(seen).toHaveLength(2); // the real hello only: the feed is up
    src.fire('error');
    tick();
    expect(seen).toHaveLength(3);
    live.close();
  });
});

describe('concerns', () => {
  it('hello interessa a todos', () => {
    expect(concerns({ topic: 'hello' }, ['brain'])).toBe(true);
  });
  it('filtra por tópico e, quando dado, por item', () => {
    expect(concerns({ topic: 'inbox', id: '1' }, ['brain'])).toBe(false);
    expect(concerns({ topic: 'inbox', id: '1' }, ['inbox', 'brain'])).toBe(true);
    expect(concerns({ topic: 'recording', id: 'a' }, ['recording'], 'b')).toBe(false);
    expect(concerns({ topic: 'recording', id: 'a' }, ['recording'], 'a')).toBe(true);
    expect(concerns({ topic: 'recording' }, ['recording'], 'a')).toBe(true);
  });
});
