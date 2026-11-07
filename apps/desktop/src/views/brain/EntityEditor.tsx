import { useState } from 'react';
import { api, type Entity } from '../../api';
import { PlusIcon, TrashIcon } from '../../components/Icons';
import { propsFromRows, rowsFromProps, type PropRow } from './editing';

/** Edit an entity's properties and text. Its id and type stay (they define what it is). */
export function EntityEditor({ entity, onDone }: { entity: Entity; onDone(saved: boolean): void }) {
  const [rows, setRows] = useState<PropRow[]>(() => rowsFromProps(entity.props));
  const [body, setBody] = useState(entity.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const setRow = (i: number, change: Partial<PropRow>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.editEntity(entity.id, { props: propsFromRows(rows, entity.props), body });
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form className="edit-form" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={`Editar ${entity.id}`}>
      <h3>Propriedades</h3>
      {rows.length === 0 && <p className="muted small">Nenhuma propriedade.</p>}
      {rows.map((r, i) => (
        <div key={i} className="prop-row">
          <label className="sr-only" htmlFor={`pk-${i}`}>Nome da propriedade {i + 1}</label>
          <input id={`pk-${i}`} value={r.key} placeholder="nome" onChange={(e) => setRow(i, { key: e.target.value })} />
          <label className="sr-only" htmlFor={`pv-${i}`}>Valor de {r.key || `propriedade ${i + 1}`}</label>
          <input id={`pv-${i}`} value={r.value} placeholder="valor" onChange={(e) => setRow(i, { value: e.target.value })} />
          <button type="button" className="icon-btn" aria-label={`Tirar ${r.key || 'propriedade'}`} onClick={() => setRows((all) => all.filter((_, j) => j !== i))}><TrashIcon size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => setRows((all) => [...all, { key: '', value: '' }])}><PlusIcon size={13} /> Propriedade</button>

      <label className="field" htmlFor="entity-body">Descrição
        <textarea id="entity-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <p className="muted small">O id ({entity.id}) e o tipo ({entity.type}) não mudam aqui. Para trocar, apague e peça ao Orbi para aprender de novo.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row gap">
        <button type="submit" className="btn primary" disabled={busy}>Salvar</button>
        <button type="button" className="btn" disabled={busy} onClick={() => onDone(false)}>Cancelar</button>
      </div>
    </form>
  );
}
