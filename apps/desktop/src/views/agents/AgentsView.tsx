import { useState } from 'react';
import { api, type Health, type InboxItem } from '../../api';
import { useLive } from '../../hooks';
import { agentStats } from './connect';
import { Requests } from './Requests';
import { Suggestions } from './Suggestions';
import { Connections } from './Connections';

type Tab = 'pedidos' | 'sugestoes' | 'conexoes';

/**
 * The Agentes screen: what coding agents asked Orbi over MCP, what they
 * suggested it learn, and how they connect (plus the MCPs Orbi itself uses).
 */
export function AgentsView({ openInbox, health, onOpenConversation }: { openInbox: InboxItem[]; health?: Health; onOpenConversation(id: string): void }) {
  const requests = useLive(api.agentRequests, ['agents']);
  const suggestions = useLive(() => api.suggestions('open'), ['agents', 'brain']);
  const clients = useLive(api.agentClients, ['agents']);
  const firstTime = clients.data !== undefined && clients.data.length === 0;
  const [tab, setTab] = useState<Tab | undefined>();
  const current: Tab = tab ?? (firstTime ? 'conexoes' : 'pedidos');
  const stats = agentStats(requests.data ?? [], openInbox);

  return (
    <div className="agentes">
      <header className="brain-head">
        <div>
          <h1>Agentes</h1>
          <p className="muted">
            Agentes de código desta máquina (Claude Code, Cursor) podem procurar o que o Orbi sabe fazer, pedir que ele execute e sugerir o que ele deveria aprender.
            A autonomia continua valendo: quem aprova é você.
          </p>
        </div>
        <div className="stats" aria-label="Resumo dos pedidos">
          <Stat n={stats.running} label="rodando" />
          <Stat n={stats.waiting} label="esperando você" warn />
          <Stat n={stats.today} label="pedidos hoje" />
          <Stat n={suggestions.data?.length} label="sugestões" warn />
        </div>
      </header>
      <div className="tabs" role="tablist">
        {([['pedidos', 'Pedidos'], ['sugestoes', 'Sugestões'], ['conexoes', 'Conexões']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={current === k} className={`tab ${current === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l}
            {k === 'sugestoes' && !!suggestions.data?.length && <span className="badge tab-badge">{suggestions.data.length}</span>}
          </button>
        ))}
      </div>
      {current === 'pedidos' && <Requests data={requests.data} error={requests.error} openInbox={openInbox} onOpen={onOpenConversation} onConnect={() => setTab('conexoes')} />}
      {current === 'sugestoes' && <Suggestions data={suggestions.data} error={suggestions.error} />}
      {current === 'conexoes' && <Connections clients={clients.data} health={health} />}
    </div>
  );
}

function Stat({ n, label, warn }: { n?: number; label: string; warn?: boolean }) {
  return <div className={`stat ${warn && n ? 'warn' : ''}`}><strong>{n ?? '–'}</strong><span>{label}</span></div>;
}
