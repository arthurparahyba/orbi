import { api, type Health } from '../../../api';
import { useLive } from '../../../hooks';
import { countsLine, STATE_LABEL } from './mcpForm';

/** The servers: the built-in Chrome first, then the ones you added. */
export function ServerList({ health, onAdd, onOpen, onChrome }: { health?: Health; onAdd(): void; onOpen(id: string): void; onChrome(): void }) {
  const servers = useLive(api.mcpServers, ['mcp-servers']);
  const chrome = health?.chrome;
  const up = !!chrome && 'tools' in chrome;
  const review = servers.data?.filter((s) => s.counts.novas > 0) ?? [];
  return (
    <>
      <div className="row mcp-head">
        <p className="muted small">Cada ferramenta é de leitura ou de escrita. A leitura roda sozinha; a escrita pede aprovação, pelas Regras de cada servidor.</p>
        <button type="button" className="btn small primary" onClick={onAdd}>Adicionar servidor</button>
      </div>
      <table className="agents-table">
        <thead><tr><th scope="col">Servidor</th><th scope="col">Como conecta</th><th scope="col">Ferramentas</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          <tr>
            <td><button type="button" className="link-btn" onClick={onChrome}><strong>Chrome DevTools</strong></button><span className="muted small block">embutido no Orbi</span></td>
            <td className="muted small">navegador do Orbi, ponte local com token</td>
            <td>{up ? `${chrome.tools}` : '—'}</td>
            <td>{up ? <span className="pill pill-done">conectado</span> : <><span className="pill pill-failed">indisponível</span><span className="muted small block">{chrome?.error ?? 'sem resposta do runtime'}</span></>}</td>
          </tr>
          {servers.data?.map((s) => (
            <tr key={s.id}>
              <td><button type="button" className="link-btn" onClick={() => onOpen(s.id)}><strong>{s.name}</strong></button></td>
              <td className="muted small mono">{s.url}</td>
              <td className={s.counts.novas ? 'warn-text' : ''}>{countsLine(s.counts)}</td>
              <td>
                <span className={`pill ${STATE_LABEL[s.state].pill}`}>{STATE_LABEL[s.state].text}</span>
                {s.state === 'erro' && s.error && <span className="muted small block">{s.error}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {servers.error && <p className="form-error">Erro: {servers.error}</p>}
      {review.map((s) => (
        <p key={s.id} className="note-warn small">{s.name} tem {s.counts.novas} {s.counts.novas === 1 ? 'ferramenta nova' : 'ferramentas novas'}. Enquanto você não marca, elas contam como escrita e pedem aprovação.</p>
      ))}
      <p className="muted small">O Orbi nunca vê a credencial: o servidor recebe o valor do cofre na hora de conectar. Na conversa e nos logs aparece só a referência.</p>
    </>
  );
}
