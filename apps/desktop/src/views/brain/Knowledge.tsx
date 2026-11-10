import { useMemo, useState } from 'react';
import type { BrainSnapshot, Playbook } from '../../api';
import { Gaps, Graph } from './Graph';
import { EntityDetail } from './EntityDetail';
import { FactList } from './FactList';
import { Frontier } from './Frontier';
import { conceptMap, mapAsSnapshot, neighborhood } from './map';

/**
 * Conhecimento without the tangle: the concepts are the map; a concept opens its facts as a list;
 * a fact shows only what is around it. The whole graph stays available, filtered.
 */
export function Knowledge({ snapshot, playbooks, onDeleted }: { snapshot: BrainSnapshot; playbooks: Playbook[]; onDeleted(): void }) {
  const [concept, setConcept] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState('');
  const map = useMemo(() => mapAsSnapshot(conceptMap(snapshot, playbooks)), [snapshot, playbooks]);
  const around = useMemo(() => (selected ? neighborhood(snapshot, selected, 1) : undefined), [snapshot, selected]);
  const pick = (id: string) => setSelected(id);

  return (
    <div className="graph-layout">
      <div className="graph-col">
        {around ? (
          <>
            <div className="graph-tools">
              <button type="button" className="btn small" onClick={() => setSelected(undefined)}>← {concept ?? 'Conceitos'}</button>
              <span className="muted small">Só o que está ligado a {selected}</span>
            </div>
            <Graph snapshot={around} selected={selected} onSelect={pick} query="" />
          </>
        ) : concept ? (
          <FactList snapshot={snapshot} concept={concept} onSelect={pick} onBack={() => setConcept(undefined)} />
        ) : (
          <>
            <div className="graph-tools">
              <label className="sr-only" htmlFor="brain-q">Filtrar conceitos</label>
              <input id="brain-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar conceitos…" />
              <span className="muted small">Clique num conceito para ver os fatos dele</span>
            </div>
            <Graph snapshot={map} onSelect={setConcept} query={query} />
            {map.entities.length > 60 && <p className="muted small">Muitos conceitos: use o filtro.</p>}
          </>
        )}
        <Frontier snapshot={snapshot} playbooks={playbooks} />
        {snapshot.gaps.length > 0 && <Gaps snapshot={snapshot} onSelect={pick} />}
      </div>
      {selected ? (
        <EntityDetail id={selected} snapshot={snapshot} onSelect={pick} onDeleted={() => { setSelected(undefined); onDeleted(); }} />
      ) : (
        <aside className="entity-detail muted small">
          <p>Os conceitos são o mapa: cada um mostra quantos fatos tem. Escolha um para ver os fatos dele em lista; escolha um fato para ver só o que está ligado a ele.</p>
        </aside>
      )}
    </div>
  );
}
