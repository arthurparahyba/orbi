import { useState } from 'react';
import { api } from '../../../api';
import { HeaderRows } from './HeaderRows';
import { ToolMarks } from './ToolMarks';
import { headersOf, marksOf, toolsForSave, urlHint, type HeaderRow, type ToolMark } from './mcpForm';

/** Adicionar servidor: name, address, credentials from the vault, test, mark the tools, save. */
export function AddServer({ onCancel, onSaved }: { onCancel(): void; onSaved(id: string): void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [rows, setRows] = useState<HeaderRow[]>([{ name: 'Authorization', value: '' }]);
  const [marks, setMarks] = useState<ToolMark[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const hint = url ? urlHint(url) : undefined;
  const run = async (f: () => Promise<void>) => { setBusy(true); setError(undefined); try { await f(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const test = () => run(async () => {
    const r = await api.testMcpServer(url.trim(), headersOf(rows));
    if (!r.ok) { setMarks(undefined); throw new Error(`Não conectou: ${r.error}`); }
    setMarks(marksOf(r));
  });
  const save = () => run(async () => {
    const saved = await api.addMcpServer({ name: name.trim(), url: url.trim(), headers: headersOf(rows), tools: toolsForSave(marks ?? []) });
    onSaved(saved.id);
  });
  const edit = (n: string, p: Partial<ToolMark>) => setMarks(marks?.map((m) => (m.name === n ? { ...m, ...p } : m)));
  return (
    <div className="mcp-add">
      <button type="button" className="link-btn small" onClick={onCancel}>← Ferramentas (MCP)</button>
      <h2>Adicionar servidor</h2>
      <label className="field">Nome<input value={name} placeholder="Jira da empresa" onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">Endereço<input className="mono" value={url} placeholder="https://jira.empresa.com.br/mcp" onChange={(e) => { setUrl(e.target.value); setMarks(undefined); }} /></label>
      <div className="field">Cabeçalhos <span className="muted small">credencial só pelo cofre: escolha em “do cofre…”</span>
        <HeaderRows rows={rows} onChange={(r) => { setRows(r); setMarks(undefined); }} />
      </div>
      {(hint || error) && <p className="form-error" role="alert">{error ?? hint}</p>}
      <div className="row"><button type="button" className="btn small" disabled={!url || !!hint || busy} onClick={() => void test()}>{busy && !marks ? 'Testando…' : 'Testar conexão'}</button></div>
      {marks && (
        <>
          <p className="small"><strong>Encontrei {marks.length} {marks.length === 1 ? 'ferramenta' : 'ferramentas'}.</strong> <span className="muted">Sem informação do servidor, conta como escrita. A que apaga começa desligada e nunca roda sozinha.</span></p>
          <ToolMarks rows={marks.map((m) => ({ ...m, deletes: m.hint === 'apaga' }))} onKind={(n, kind) => edit(n, { kind })} onEnabled={(n, enabled) => edit(n, { enabled })} />
          <div className="row">
            <button type="button" className="btn small primary" disabled={!name.trim() || busy} onClick={() => void save()}>Salvar</button>
            <button type="button" className="btn small" onClick={onCancel}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}
