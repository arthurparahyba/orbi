import { useState } from 'react';
import type { BrainSnapshot } from '../../api';
import { factsOf } from './map';
import { fmt } from './look';

/** The facts of one concept as a list (not as nodes): filter, other names, where each came from. */
export function FactList({ snapshot, concept, onSelect, onBack }: { snapshot: BrainSnapshot; concept: string; onSelect(id: string): void; onBack(): void }) {
  const [query, setQuery] = useState('');
  const type = snapshot.types.find((t) => t.name === concept);
  const facts = factsOf(snapshot, concept, query);
  const knows = Object.entries(type?.knows ?? {});
  return (
    <section className="fact-list" aria-label={`Fatos de ${concept}`}>
      <div className="row gap">
        <button type="button" className="btn small" onClick={onBack}>← Conceitos</button>
        <h2>{concept}</h2>
        <span className="muted small">{type?.description}</span>
      </div>
      {knows.length > 0 && (
        <p className="small">Sabe: {knows.map(([k, v]) => <span key={k} className="knows"><code>{k}</code> {v}</span>)}</p>
      )}
      <label className="sr-only" htmlFor="fact-q">Filtrar fatos</label>
      <input id="fact-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Filtrar ${concept} pelo nome…`} />
      {facts.length === 0 ? <p className="muted small">Nenhum {concept} {query ? 'com esse nome' : 'conhecido ainda'}.</p> : (
        <table className="facts">
          <thead><tr><th>Nome</th><th>Também chamado</th><th>Origem</th><th>Atualizado</th></tr></thead>
          <tbody>
            {facts.map((e) => (
              <tr key={e.id}>
                <td><button type="button" className="link-btn" onClick={() => onSelect(e.id)}>{e.id}</button></td>
                <td>{(e.aliases ?? []).join(', ')}</td>
                <td className="muted">{e.source?.startsWith('execucao:') ? 'execução' : e.source ? 'cartão' : ''}</td>
                <td className="muted">{e.updatedAt ? fmt(e.updatedAt) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
