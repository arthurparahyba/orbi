import { useState } from 'react';
import { api, type Health, type InboxItem } from '../../../api';
import { useLive } from '../../../hooks';
import { agentStats } from './connect';
import { Requests } from './Requests';
import { Connections } from './Connections';

type Tab = 'pedidos' | 'conexoes';

/**
 * Autonomia › Agentes que pedem: what coding agents asked Orbi over MCP and how they connect.
 * What they suggest it learn is on Cérebro › Sugestões (docs/funcionalidades/20).
 */
export function AgentsView({ openInbox, health, onOpenConversation }: { openInbox: InboxItem[]; health?: Health; onOpenConversation(id: string): void }) {
  const requests = useLive(api.agentRequests, ['agents']);
  const clients = useLive(api.agentClients, ['agents']);
  const firstTime = clients.data !== undefined && clients.data.length === 0;
  const [tab, setTab] = useState<Tab | undefined>();
  const current: Tab = tab ?? (firstTime ? 'conexoes' : 'pedidos');
  const stats = agentStats(requests.data ?? [], openInbox);

  return (
    <div className="agentes">
      <header className="brain-head">
        <div>
          <h1>Agentes que pedem</h1>
          <p className="muted">
            Agentes de código desta máquina (Claude Code, Cursor) podem procurar o que o Orbi sabe fazer e pedir que ele execute. O que eles sugerem que o Orbi aprenda fica no Cérebro, em Sugestões.
            A autonomia continua valendo: quem aprova é você.
          </p>
        </div>
        <div className="stats" aria-label="Resumo dos pedidos">
          <Stat n={stats.running} label="rodando" />
          <Stat n={stats.waiting} label="esperando você" warn />
          <Stat n={stats.today} label="pedidos hoje" />
        </div>
      </header>
      <div className="tabs" role="tablist">
        {([['pedidos', 'Pedidos'], ['conexoes', 'Conexões']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={current === k} className={`tab ${current === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {current === 'pedidos' && <Requests data={requests.data} error={requests.error} openInbox={openInbox} onOpen={onOpenConversation} onConnect={() => setTab('conexoes')} />}
      {current === 'conexoes' && <Connections clients={clients.data} health={health} />}
    </div>
  );
}

function Stat({ n, label, warn }: { n?: number; label: string; warn?: boolean }) {
  return <div className={`stat ${warn && n ? 'warn' : ''}`}><strong>{n ?? '–'}</strong><span>{label}</span></div>;
}
