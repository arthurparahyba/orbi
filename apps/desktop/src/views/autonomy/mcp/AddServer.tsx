import { useState } from 'react';
import { api } from '../../../api';
import { Segmented } from '../../../components/Segmented';
import { HeaderRows } from './HeaderRows';
import { ToolMarks } from './ToolMarks';
import { ConfirmCommand } from './ConfirmCommand';
import { commandHint, marksOf, targetOf, toolsForSave, urlHint, type HeaderRow, type ToolMark, type Transport } from './mcpForm';

/** Adicionar servidor: by address or by a program on this machine; credentials from the vault; test, mark, save. */
export function AddServer({ onCancel, onSaved }: { onCancel(): void; onSaved(id: string): void }) {
  const [name, setName] = useState('');
  const [how, setHow] = useState<Transport>('http');
  const [url, setUrl] = useState('');
  const [line, setLine] = useState('');
  const [rows, setRows] = useState<HeaderRow[]>([{ name: 'Authorization', value: '' }]);
  const [env, setEnv] = useState<HeaderRow[]>([]);
  const [marks, setMarks] = useState<ToolMark[]>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const reset = () => { setMarks(undefined); setConfirming(false); };
  const hint = how === 'http' ? (url ? urlHint(url) : undefined) : (line ? commandHint(line) : undefined);
  const ready = how === 'http' ? !!url && !hint : !!line && !hint;
  const run = async (f: () => Promise<void>) => { setBusy(true); setError(undefined); try { await f(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  // A program only runs after you confirm it (approve): the runtime refuses otherwise.
  const test = () => run(async () => {
    const r = await api.testMcpServer({ ...targetOf(how, url, rows, line, env), approve: how === 'command' });
    setConfirming(false);
    if (!r.ok) { setMarks(undefined); throw new Error(`Não conectou: ${r.error}`); }
    setMarks(marksOf(r));
  });
  const save = () => run(async () => {
    const saved = await api.addMcpServer({ name: name.trim(), ...targetOf(how, url, rows, line, env), approve: how === 'command', tools: toolsForSave(marks ?? []) });
    onSaved(saved.id);
  });
  const edit = (n: string, p: Partial<ToolMark>) => setMarks(marks?.map((m) => (m.name === n ? { ...m, ...p } : m)));
  return (
    <div className="mcp-add">
      <button type="button" className="link-btn small" onClick={onCancel}>← Ferramentas (MCP)</button>
      <h2>Adicionar servidor</h2>
      <label className="field">Nome<input value={name} placeholder="Jira da empresa" onChange={(e) => setName(e.target.value)} /></label>
      <div className="field">Como conecta
        <Segmented label="Como conecta" value={how} onChange={(t) => { setHow(t); reset(); }} options={[{ value: 'http', label: 'Endereço (HTTP)' }, { value: 'command', label: 'Comando local' }]} />
      </div>
      {how === 'http' ? (
        <>
          <label className="field">Endereço<input className="mono" value={url} placeholder="https://jira.empresa.com.br/mcp" onChange={(e) => { setUrl(e.target.value); reset(); }} /></label>
          <div className="field">Cabeçalhos <span className="muted small">credencial só pelo cofre: escolha em “do cofre…”</span><HeaderRows rows={rows} onChange={(r) => { setRows(r); reset(); }} /></div>
        </>
      ) : (
        <>
          <label className="field">Comando <span className="muted small">o Orbi inicia este programa e fala com ele pela entrada e saída padrão</span>
            <input className="mono" value={line} placeholder="npx -y servicenow-mcp --instance empresa" onChange={(e) => { setLine(e.target.value); reset(); }} />
          </label>
          <div className="field">Variáveis de ambiente <span className="muted small">só estas chegam ao programa; credencial só pelo cofre</span><HeaderRows kind="variavel" rows={env} onChange={(r) => { setEnv(r); reset(); }} /></div>
        </>
      )}
      {(hint || error) && <p className="form-error" role="alert">{error ?? hint}</p>}
      {confirming
        ? <ConfirmCommand line={line} busy={busy} onRun={() => void test()} onCancel={() => setConfirming(false)} />
        : <div className="row"><button type="button" className="btn small" disabled={!ready || busy} onClick={() => (how === 'command' ? setConfirming(true) : void test())}>{busy ? 'Testando…' : 'Testar conexão'}</button></div>}
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
