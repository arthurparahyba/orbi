import { api } from '../../../api';
import { useLive } from '../../../hooks';
import { AddSecret } from '../AddSecret';
import { secretRef, type HeaderRow } from './mcpForm';

/**
 * The headers the server needs. A credential is never typed here: pick it from the vault (the
 * header gets {{segredo:nome}}) or keep a new one in the vault first.
 */
export function HeaderRows({ rows, onChange, kind = 'cabecalho' }: { rows: HeaderRow[]; onChange(rows: HeaderRow[]): void; kind?: 'cabecalho' | 'variavel' }) {
  const ph = kind === 'cabecalho' ? { name: 'Authorization', value: 'Bearer {{segredo:jira/token}}', add: '+ Cabeçalho' } : { name: 'SNOW_PASSWORD', value: '{{segredo:snow/senha}}', add: '+ Variável' };
  const vault = useLive(api.vault, ['vault']);
  const names = vault.data?.secrets.map((s) => s.name) ?? [];
  const set = (i: number, p: Partial<HeaderRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="mcp-headers">
      {rows.map((r, i) => (
        <div key={i} className="mcp-header-row">
          <label className="sr-only" htmlFor={`h-name-${i}`}>{kind === 'cabecalho' ? 'Cabeçalho' : 'Variável'}</label>
          <input id={`h-name-${i}`} className="mono" value={r.name} placeholder={ph.name} onChange={(e) => set(i, { name: e.target.value })} />
          <label className="sr-only" htmlFor={`h-value-${i}`}>Valor</label>
          <input id={`h-value-${i}`} className="mono" value={r.value} placeholder={ph.value} onChange={(e) => set(i, { value: e.target.value })} />
          <select aria-label="Usar credencial do cofre" value="" onChange={(e) => e.target.value && set(i, { value: `${r.value.replace(/\{\{segredo:[^}]*\}\}/g, '').trim()} ${secretRef(e.target.value)}`.trim() })}>
            <option value="">do cofre…</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" className="btn small" aria-label="Tirar este cabeçalho" onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn small" onClick={() => onChange([...rows, { name: '', value: '' }])}>{ph.add}</button>
        <AddSecret taken={names} onAdded={() => void vault.reload()} />
      </div>
    </div>
  );
}
