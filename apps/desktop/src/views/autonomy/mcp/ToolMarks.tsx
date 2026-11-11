import { Segmented } from '../../../components/Segmented';
import { hintLabel } from './mcpForm';

type Row = { name: string; description: string; hint: 'leitura' | 'escrita' | 'apaga' | null; kind: 'leitura' | 'escrita'; deletes: boolean; enabled: boolean; isNew?: boolean };

/** Each tool: what it does, how Orbi knows, leitura or escrita, on or off. */
export function ToolMarks({ rows, onKind, onEnabled }: { rows: Row[]; onKind(name: string, kind: 'leitura' | 'escrita'): void; onEnabled(name: string, on: boolean): void }) {
  return (
    <table className="agents-table mcp-tool-table">
      <thead><tr><th scope="col">Ferramenta</th><th scope="col">O que faz</th><th scope="col">Como sei</th><th scope="col">Tipo</th><th scope="col">Usar</th></tr></thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.name}>
            <td className="mono">{t.name}{t.isNew && <span className="pill warn-text"> nova</span>}</td>
            <td className="muted small">{t.description}</td>
            <td className="muted small">{hintLabel(t.hint)}</td>
            <td>
              <Segmented label={`Tipo de ${t.name}`} value={t.kind} onChange={(k) => onKind(t.name, k)}
                options={[{ value: 'leitura', label: 'Leitura' }, { value: 'escrita', label: t.deletes ? 'Apaga' : 'Escrita' }]} />
            </td>
            <td><label className="check"><input type="checkbox" checked={t.enabled} onChange={(e) => onEnabled(t.name, e.target.checked)} /><span className="sr-only">Usar {t.name}</span></label></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
