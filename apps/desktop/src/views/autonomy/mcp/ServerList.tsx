import { api, type Health } from '../../../api';
import { useLive } from '../../../hooks';
import { countsLine, howLine, STATE_LABEL } from './mcpForm';

/**
 * Os servidores que você cadastrou. Nenhum vem embarcado (documento 31): o navegador do Orbi é um
 * destes, marcado por você — por isso a aplicação chega sem navegador nenhum.
 */
export function ServerList({ health, onAdd, onOpen, onChrome }: { health?: Health; onAdd(): void; onOpen(id: string): void; onChrome(): void }) {
  const servers = useLive(api.mcpServers, ['mcp-servers']);
  const review = servers.data?.filter((s) => s.counts.novas > 0) ?? [];
  const noBrowser = !!servers.data && !health?.browser.serverId;
  return (
    <>
      <div className="row mcp-head">
        <p className="muted small">Cada ferramenta é de leitura ou de escrita. A leitura roda sozinha; a escrita pede aprovação, pelas Regras de cada servidor.</p>
        <button type="button" className="btn small primary" onClick={onAdd}>Adicionar servidor</button>
      </div>
      {noBrowser && (
        <p className="muted small">
          Nenhum servidor está marcado como <strong>navegador do Orbi</strong>: os procedimentos que usam navegador vão
          recusar até você marcar um. Cadastre-o por comando (ex.: <code>npx chrome-devtools-mcp</code>) e abra-o para marcar.
        </p>
      )}
      <table className="agents-table">
        <thead><tr><th scope="col">Servidor</th><th scope="col">Como conecta</th><th scope="col">Ferramentas</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          {servers.data?.map((s) => (
            <tr key={s.id}>
              <td>
                <button type="button" className="link-btn" onClick={() => onOpen(s.id)}><strong>{s.name}</strong></button>
                {s.isBrowser && <span className="pill tiny">navegador</span>}
              </td>
              <td className="muted small mono">{s.transport === 'command' && <span className="block">comando local</span>}{howLine(s)}</td>
              <td className={s.counts.novas ? 'warn-text' : ''}>{countsLine(s.counts)}</td>
              <td>
                <span className={`pill ${STATE_LABEL[s.state].pill}`}>{STATE_LABEL[s.state].text}</span>
                {s.state === 'erro' && s.error && <span className="muted small block">{s.error}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        O Chrome que o Orbi abre para gravar uma demonstração é outro ajuste:{' '}
        <button type="button" className="link-btn" onClick={onChrome}>Chrome do gravador</button>.
      </p>
      {servers.error && <p className="form-error">Erro: {servers.error}</p>}
      {review.map((s) => (
        <p key={s.id} className="note-warn small">{s.name} tem {s.counts.novas} {s.counts.novas === 1 ? 'ferramenta nova' : 'ferramentas novas'}. Enquanto você não marca, elas contam como escrita e pedem aprovação.</p>
      ))}
      <p className="muted small">O Orbi nunca vê a credencial: o servidor recebe o valor do cofre na hora de conectar. Na conversa e nos logs aparece só a referência.</p>
    </>
  );
}
