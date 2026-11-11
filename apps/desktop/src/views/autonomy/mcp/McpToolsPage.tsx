import type { Health } from '../../../api';

/**
 * Autonomia › Ferramentas (MCP): the MCP servers Orbi uses to act on other systems
 * (docs/funcionalidades/20). For now, the built-in Chrome DevTools; adding servers comes next.
 */
export function McpToolsPage({ health }: { health?: Health }) {
  const chrome = health?.chrome;
  const up = !!chrome && 'tools' in chrome;
  return (
    <section className="mcp-tools" aria-label="Servidores MCP">
      <table className="agents-table">
        <thead><tr><th scope="col">Servidor</th><th scope="col">Como conecta</th><th scope="col">Ferramentas</th><th scope="col">Regras</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Chrome DevTools</strong><span className="muted small block">embutido no Orbi</span></td>
            <td className="muted small">navegador do Orbi, ponte local com token</td>
            <td>{up ? chrome.tools : '—'}</td>
            <td className="muted small">Navegador: leitura e escrita, em Regras</td>
            <td>
              {up
                ? <span className="pill pill-done">conectado</span>
                : <><span className="pill pill-failed">indisponível</span><span className="muted small block">{chrome?.error ?? 'sem resposta do runtime'}</span></>}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        Em breve: adicionar outros servidores (Jira, ServiceNow…) por endereço ou por comando local, com cada ferramenta marcada como leitura ou escrita,
        credenciais do cofre e a escrita pedindo aprovação pelas Regras. As configurações do Chrome também vêm para esta página.
      </p>
    </section>
  );
}
