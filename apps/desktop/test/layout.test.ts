import { describe, expect, it } from 'vitest';
import { layout } from '../src/views/brain/layout';
import type { Edge, Entity } from '../src/api';

const entity = (id: string): Entity => ({ id, type: 'Repositorio', props: {}, body: '', updatedAt: '' });
const edge = (from: string, to: string): Edge => ({ from, rel: 'usa', to, attrs: {}, validFrom: '', validTo: null });

describe('layout do grafo', () => {
  const entities = ['a', 'b', 'c', 'd'].map(entity);
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('x', 'a')];

  it('posiciona todo nó dentro da área, com margem', () => {
    const pos = layout(entities, edges, 900, 560);
    expect([...pos.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const p of pos.values()) {
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(860);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(530);
    }
  });

  it('é determinístico e aproxima quem está ligado', () => {
    const one = layout(entities, edges, 900, 560);
    const two = layout(entities, edges, 900, 560);
    expect([...one.values()]).toEqual([...two.values()]);
    const dist = (u: string, v: string) => Math.hypot(one.get(u)!.x - one.get(v)!.x, one.get(u)!.y - one.get(v)!.y);
    expect(dist('a', 'b')).toBeLessThan(dist('a', 'd'));
  });
});
