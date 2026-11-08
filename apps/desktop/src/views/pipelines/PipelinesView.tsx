import { useState } from 'react';
import { api } from '../../api';
import { useLive } from '../../hooks';
import { RunsTable } from './RunsTable';
import { MyPipelines } from './MyPipelines';

type Tab = 'andamento' | 'minhas';

/** Esteiras: deliveries running (one per conversation) and the esteiras you have. */
export function PipelinesView({ onOpenConversation }: { onOpenConversation(id: string): void }) {
  const runs = useLive(() => api.pipelineRuns(), ['pipelines']);
  const defs = useLive(api.pipelines, ['pipelines', 'brain']);
  const [tab, setTab] = useState<Tab | undefined>();
  const current: Tab = tab ?? (runs.data && runs.data.length === 0 ? 'minhas' : 'andamento');
  const active = (runs.data ?? []).filter((r) => r.status === 'running' || r.status === 'waiting');
  return (
    <div className="agentes">
      <header className="brain-head">
        <div>
          <h1>Esteiras</h1>
          <p className="muted">Procedimentos em sequência: quando um termina, o próximo começa com o que o anterior entregou. Cada entrega roda numa conversa.</p>
        </div>
        <div className="stats" aria-label="Resumo">
          <div className="stat"><strong>{active.filter((r) => r.status === 'running').length}</strong><span>rodando</span></div>
          <div className={`stat ${active.some((r) => r.status === 'waiting') ? 'warn' : ''}`}><strong>{active.filter((r) => r.status === 'waiting').length}</strong><span>esperando você</span></div>
          <div className="stat"><strong>{defs.data?.length ?? '–'}</strong><span>esteiras</span></div>
        </div>
      </header>
      <div className="tabs" role="tablist">
        {([['andamento', 'Em andamento'], ['minhas', 'Minhas esteiras']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={current === k} className={`tab ${current === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l}{k === 'andamento' && active.length > 0 && <span className="badge tab-badge">{active.length}</span>}
          </button>
        ))}
      </div>
      {current === 'andamento' && <RunsTable runs={runs.data} error={runs.error} onOpen={onOpenConversation} onNew={() => setTab('minhas')} />}
      {current === 'minhas' && <MyPipelines defs={defs.data} error={defs.error} onStarted={onOpenConversation} />}
    </div>
  );
}
