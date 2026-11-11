import type { AgentClient, Health } from '../../../api';
import { ConnectAgent } from './ConnectAgent';
import { ClientList } from './ClientList';

/** Conexões: agents that ask Orbi (Orbi as MCP server). The MCPs Orbi uses are on Autonomia › Ferramentas (MCP). */
export function Connections({ clients, health }: { clients?: AgentClient[]; health?: Health }) {
  const url = health?.mcpUrl ?? 'http://127.0.0.1:3000/mcp';
  return (
    <div className="connections">
      <section aria-labelledby="con-in">
        <h2 id="con-in">Agentes que pedem ao Orbi <span className="muted small">o Orbi como servidor MCP, só nesta máquina · <code>{url}</code></span></h2>
        <div className="con-grid">
          <ConnectAgent url={url} clients={clients} />
          <ClientList clients={clients} />
        </div>
      </section>
    </div>
  );
}
