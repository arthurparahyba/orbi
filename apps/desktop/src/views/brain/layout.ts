import type { Edge, Entity } from '../../api';

// Force-directed layout, computed once per graph shape.
export interface P { id: string; x: number; y: number; vx: number; vy: number }

export function layout(entities: Entity[], edges: Edge[], w: number, h: number): Map<string, P> {
  const nodes: P[] = entities.map((e, i) => {
    const a = (i / Math.max(entities.length, 1)) * Math.PI * 2;
    return { id: e.id, x: w / 2 + Math.cos(a) * w * 0.3, y: h / 2 + Math.sin(a) * h * 0.3, vx: 0, vy: 0 };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  for (let it = 0; it < 300; it++) {
    const t = 1 - it / 300;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      const d2 = Math.max(dx * dx + dy * dy, 25);
      const f = 12000 / d2;
      const d = Math.sqrt(d2); dx /= d; dy /= d;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const l of links) {
      const a = byId.get(l.from)!, b = byId.get(l.to)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 130) * 0.03;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.002; n.vy += (h / 2 - n.y) * 0.003;
      n.x += Math.max(-20, Math.min(20, n.vx)) * t; n.y += Math.max(-20, Math.min(20, n.vy)) * t;
      n.vx *= 0.5; n.vy *= 0.5;
      n.x = Math.max(40, Math.min(w - 40, n.x)); n.y = Math.max(30, Math.min(h - 30, n.y));
    }
  }
  return byId;
}
