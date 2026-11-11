import { useState } from 'react';
import { api } from '../../../api';
import { useLive } from '../../../hooks';
import { ToolMarks } from './ToolMarks';
import { countsLine, STATE_LABEL } from './mcpForm';

/** One server: its state, connect again, turn off, remove, and each tool's type. */
export function ServerPage({ id, onBack, onRemoved }: { id: string; onBack(): void; onRemoved(): void }) {
  const s = useLive(() => api.mcpServer(id), ['mcp-servers']);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const act = async (f: () => Promise<unknown>) => { setError(undefined); try { await f(); await s.reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  if (!s.data) return <p className="muted">{s.error ? `Erro: ${s.error}` : 'Carregando…'}</p>;
  const d = s.data;
  const state = STATE_LABEL[d.state];
  return (
    <div className="mcp-server">
      <button type="button" className="link-btn small" onClick={onBack}>← Ferramentas (MCP)</button>
      <div className="row mcp-head">
        <div>
          <h2>{d.name} <span className={`pill ${state.pill}`}>{state.text}</span></h2>
          <p className="muted small mono">{d.url}</p>
          {Object.entries(d.headers).map(([k, v]) => <p key={k} className="muted small mono">{k}: {v}</p>)}
          {d.state === 'erro' && d.error && <p className="form-error">{d.error}</p>}
        </div>
        <div className="row">
          <button type="button" className="btn small" onClick={() => void act(() => api.refreshMcpServer(id))}>Reconectar</button>
          <button type="button" className="btn small" onClick={() => void act(() => api.editMcpServer(id, { enabled: !d.enabled }))}>{d.enabled ? 'Desligar' : 'Ligar'}</button>
          {confirm
            ? <><button type="button" className="btn small danger" onClick={() => void act(async () => { await api.removeMcpServer(id); onRemoved(); })}>Remover de vez</button><button type="button" className="btn small" onClick={() => setConfirm(false)}>Não</button></>
            : <button type="button" className="btn small" onClick={() => setConfirm(true)}>Remover</button>}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="small">{countsLine(d.counts)}. <span className="muted">As regras deste servidor (leitura e escrita) ficam em Autonomia › Regras.</span></p>
      <ToolMarks
        rows={d.tools.map((t) => ({ ...t, kind: t.effective === 'leitura' ? 'leitura' : 'escrita', deletes: t.effective === 'apaga' }))}
        onKind={(n, kind) => void act(() => api.setMcpTool(id, n, { kind }))}
        onEnabled={(n, enabled) => void act(() => api.setMcpTool(id, n, { enabled }))}
      />
    </div>
  );
}
