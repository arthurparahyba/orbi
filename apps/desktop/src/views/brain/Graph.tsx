import { useMemo } from 'react';
import type { BrainSnapshot, Entity } from '../../api';
import { colorOf, labelOf } from './look';
import { layout } from './layout';

/** The knowledge graph: entities as nodes, current relations as arrows. */
export function Graph({ snapshot, selected, onSelect, query }: { snapshot: BrainSnapshot; selected?: string; onSelect(id: string): void; query: string }) {
  const W = 900, H = 560;
  const current = useMemo(() => snapshot.edges.filter((e) => !e.validTo), [snapshot.edges]);
  const shape = snapshot.entities.map((e) => e.id).join('|') + '#' + current.map((e) => `${e.from}>${e.to}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pos = useMemo(() => layout(snapshot.entities, current, W, H), [shape]);
  const q = query.trim().toLowerCase();
  const match = (e: Entity) => !q || `${e.id} ${e.type} ${labelOf(e)}`.toLowerCase().includes(q);
  const neighbors = new Set(selected ? current.flatMap((e) => (e.from === selected ? [e.to] : e.to === selected ? [e.from] : [])) : []);
  const gapIds = new Set(snapshot.gaps.map((g) => g.entity));

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="graph" role="img" aria-label={`Grafo com ${snapshot.entities.length} entidades e ${current.length} relações`}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#4A5160" />
          </marker>
        </defs>
        {current.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const hot = selected && (e.from === selected || e.to === selected);
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          const ex = b.x - (dx / d) * 14, ey = b.y - (dy / d) * 14;
          return (
            <g key={i} className={`edge ${hot ? 'hot' : selected ? 'dim' : ''}`}>
              <line x1={a.x} y1={a.y} x2={ex} y2={ey} markerEnd="url(#arrow)" />
              {hot && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle">{e.rel}</text>}
            </g>
          );
        })}
        {snapshot.entities.map((e) => {
          const p = pos.get(e.id);
          if (!p) return null;
          const isSel = e.id === selected;
          const dim = (selected && !isSel && !neighbors.has(e.id)) || !match(e);
          return (
            <g
              key={e.id}
              className={`node ${isSel ? 'sel' : ''} ${dim ? 'dim' : ''}`}
              transform={`translate(${p.x},${p.y})`}
              onClick={() => onSelect(e.id)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') onSelect(e.id); }}
              tabIndex={0}
              role="button"
              aria-label={`${e.type} ${labelOf(e)}`}
            >
              <circle r={isSel ? 11 : e.type === 'Classe' ? 9 : 7} fill={colorOf(e.type)} />
              {gapIds.has(e.id) && <circle r={14} className="gap-ring" />}
              <text y={-14} textAnchor="middle">{labelOf(e)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Legend({ snapshot }: { snapshot: BrainSnapshot }) {
  const used = [...new Set(snapshot.entities.map((e) => e.type))];
  return (
    <ul className="legend" aria-label="Legenda de tipos">
      {used.map((t) => <li key={t}><span className="swatch" style={{ background: colorOf(t) }} />{t}</li>)}
    </ul>
  );
}

export function Gaps({ snapshot, onSelect }: { snapshot: BrainSnapshot; onSelect(id: string): void }) {
  return (
    <section className="gaps">
      <h3>Lacunas que o Orbi vai perguntar</h3>
      <ul>
        {snapshot.gaps.map((g, i) => (
          <li key={i}>
            <button type="button" className="link-btn" onClick={() => onSelect(g.entity)}>{g.entity}</button>
            <span className="muted"> não tem a relação </span><code>{g.missing}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
