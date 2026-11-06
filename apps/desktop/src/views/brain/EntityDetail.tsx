import { useEffect, useState } from 'react';
import { api, type BrainSnapshot } from '../../api';
import { colorOf, fmt, labelOf } from './look';

/** What Orbi knows about one entity: properties, relations now and their history. */
export function EntityDetail({ id, snapshot, onSelect }: { id?: string; snapshot: BrainSnapshot; onSelect(id: string): void }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.entity>>>();
  useEffect(() => {
    setDetail(undefined);
    if (id) api.entity(id).then(setDetail, () => setDetail(undefined));
  }, [id, snapshot.stats.edges, snapshot.stats.entities]);

  if (!id) return <aside className="detail muted pad">Selecione um nó para ver o que o Orbi sabe sobre ele, com as relações atuais e o histórico.</aside>;
  if (!detail) return <aside className="detail muted pad">Carregando…</aside>;
  const e = detail.entity;
  const history = snapshot.edges.filter((x) => (x.from === e.id || x.to === e.id) && x.validTo);
  const props = Object.entries(e.props).filter(([k]) => !['name', 'nome'].includes(k));

  return (
    <aside className="detail" aria-label={`Detalhes de ${e.id}`}>
      <span className="type-chip" style={{ borderColor: colorOf(e.type), color: colorOf(e.type) }}>{e.type}</span>
      <h2>{labelOf(e)}</h2>
      <p className="mono muted small">{e.id}</p>
      {e.body && <p>{e.body}</p>}
      {props.length > 0 && (
        <dl className="props">
          {props.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd></div>)}
        </dl>
      )}
      <h3>Relações</h3>
      <ul className="rels">
        {detail.relations.out.map((r, i) => (
          <li key={`o${i}`}><code>{r.rel}</code> → <button type="button" className="link-btn" onClick={() => onSelect(r.to)}>{r.to}</button><span className="muted small"> desde {fmt(r.validFrom)}</span></li>
        ))}
        {detail.relations.in.map((r, i) => (
          <li key={`i${i}`}><button type="button" className="link-btn" onClick={() => onSelect(r.from)}>{r.from}</button> → <code>{r.rel}</code><span className="muted small"> desde {fmt(r.validFrom)}</span></li>
        ))}
        {detail.relations.out.length + detail.relations.in.length === 0 && <li className="muted">Nenhuma relação ainda.</li>}
      </ul>
      {history.length > 0 && (
        <>
          <h3>Histórico</h3>
          <ul className="rels past">
            {history.map((r, i) => <li key={i}><s>{r.from} <code>{r.rel}</code> {r.to}</s><span className="muted small"> {fmt(r.validFrom)} – {fmt(r.validTo!)}</span></li>)}
          </ul>
        </>
      )}
      <p className="muted small">Atualizado em {fmt(e.updatedAt)} · {detail.nearby.length} entidades a até 2 saltos</p>
    </aside>
  );
}
