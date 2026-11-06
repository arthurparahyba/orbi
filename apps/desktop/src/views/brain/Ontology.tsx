import type { BrainSnapshot } from '../../api';
import { colorOf } from './look';

/** The ontology's types: what each means and the relations it allows. */
export function Ontology({ snapshot }: { snapshot: BrainSnapshot }) {
  const counts = new Map<string, number>();
  for (const e of snapshot.entities) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  if (snapshot.types.length === 0) {
    return <p className="muted pad">Nenhum tipo ainda. O Orbi propõe cada tipo na primeira vez que precisar dele, junto com o que aprendeu.</p>;
  }
  return (
    <div className="onto-grid">
      {snapshot.types.map((t) => (
        <article key={t.name} className="onto-card" style={{ borderTopColor: colorOf(t.name) }}>
          <header><strong>{t.name}</strong><span className="muted small">{counts.get(t.name) ?? 0} entidades</span></header>
          <p className="muted small">{t.description}</p>
          {Object.keys(t.relations).length > 0 && (
            <ul className="rels small">
              {Object.entries(t.relations).map(([rel, target]) => (
                <li key={rel}><code>{rel}</code> → {target === '*' ? 'qualquer' : target}{t.requires.includes(rel) && <span className="pill tiny">obrigatória</span>}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
