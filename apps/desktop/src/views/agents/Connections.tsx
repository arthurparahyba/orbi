import type { AgentClient, Health } from '../../api';
import { ConnectAgent } from './ConnectAgent';
import { ClientList } from './ClientList';

/** Conexões, both ways: agents that ask Orbi (Orbi as MCP server) and the MCPs Orbi uses. */
export function Connections({ clients, health }: { clients?: AgentClient[]; health?: Health }) {
  const url = health?.mcpUrl ?? 'http://127.0.0.1:3000/mcp';
  const chrome = health?.chrome;
  return (
    <div className="connections">
      <section aria-labelledby="con-in">
        <h2 id="con-in">Agentes que pedem ao Orbi <span className="muted small">o Orbi como servidor MCP, só nesta máquina · <code>{url}</code></span></h2>
        <div className="con-grid">
          <ConnectAgent url={url} clients={clients} />
          <ClientList clients={clients} />
        </div>
      </section>
      <section aria-labelledby="con-out">
        <h2 id="con-out">Ferramentas que o Orbi usa (MCP)</h2>
        <table className="agents-table">
          <thead><tr><th scope="col">Servidor</th><th scope="col">Como conecta</th><th scope="col">Ferramentas</th><th scope="col">Estado</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Chrome DevTools</strong><span className="muted small block">embutido no Orbi</span></td>
              <td className="muted small">ponte local, com token</td>
              <td>{chrome && 'tools' in chrome ? chrome.tools : '—'}</td>
              <td>
                {chrome && 'tools' in chrome
                  ? <span className="pill pill-done">conectado</span>
                  : <><span className="pill pill-failed">indisponível</span><span className="muted small block">{chrome?.error ?? 'sem resposta do runtime'}</span></>}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Adicionar outros MCPs (Jira, ServiceNow…) vem na próxima etapa: cada ferramenta marcada como leitura ou escrita, credenciais do cofre e tudo passando pela autonomia.
        </p>
      </section>
    </div>
  );
}
