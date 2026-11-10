import { useState } from 'react';
import { api } from '../../api';
import { useLive } from '../../hooks';
import { Knowledge } from './Knowledge';
import { Playbooks } from './Playbooks';
import { Runs } from './Runs';
import { Ontology } from './Ontology';

type Tab = 'grafo' | 'playbooks' | 'execucoes' | 'ontologia';

export function BrainView() {
  const brain = useLive(api.brain, ['brain']);
  const playbooks = useLive(api.playbooks, ['brain']);
  const [tab, setTab] = useState<Tab>('grafo');
  const [exported, setExported] = useState<string>();
  const s = brain.data?.stats;

  return (
    <div className="cerebro">
      <header className="brain-head">
        <div>
          <h1>Cérebro</h1>
          <p className="muted">O que o Orbi aprendeu: tipos da ontologia, coisas do seu ambiente, como elas se relacionam e os procedimentos (playbooks).</p>
        </div>
        <div className="stats" aria-label="Resumo do cérebro">
          <Stat n={s?.types} label="tipos" />
          <Stat n={s?.entities} label="entidades" />
          <Stat n={s?.edges} label="relações" />
          <Stat n={s?.playbooks} label="playbooks" />
          <Stat n={brain.data?.gaps.length} label="lacunas" warn />
        </div>
      </header>
      <div className="tabs" role="tablist">
        {([['grafo', 'Conhecimento'], ['playbooks', 'Playbooks'], ['execucoes', 'Execuções'], ['ontologia', 'Ontologia']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
        <span className="spacer" />
        <button type="button" className="btn small" onClick={async () => { const r = await api.exportBrain(); setExported(`${r.written} notas em ${r.dir}`); }}>
          Exportar Markdown
        </button>
      </div>
      {exported && <p className="muted small pad-x">Exportado: {exported}</p>}
      {!brain.data ? (
        <p className="muted pad">{brain.error ? `Erro: ${brain.error}` : 'Carregando…'}</p>
      ) : tab === 'grafo' && brain.data.entities.length === 0 ? (
        <EmptyBrain />
      ) : tab === 'grafo' ? (
        <Knowledge snapshot={brain.data} playbooks={playbooks.data ?? []} onDeleted={() => void brain.reload()} />
      ) : tab === 'playbooks' ? (
        <Playbooks />
      ) : tab === 'execucoes' ? (
        <Runs />
      ) : (
        <Ontology snapshot={brain.data} />
      )}
    </div>
  );
}

/** The brain starts empty and grows with the work. */
function EmptyBrain() {
  return (
    <div className="empty-brain">
      <h2>O cérebro ainda está vazio</h2>
      <p className="muted">
        O Orbi não vem sabendo nada do seu ambiente. Ele aprende enquanto trabalha com você: peça algo na conversa ou
        use “Ensinar pelo navegador”. Cada coisa aprendida (um tipo novo, um repositório, um procedimento) chega para
        você aprovar antes de ficar guardada aqui.
      </p>
    </div>
  );
}

function Stat({ n, label, warn }: { n?: number; label: string; warn?: boolean }) {
  return <div className={`stat ${warn && n ? 'warn' : ''}`}><strong>{n ?? '–'}</strong><span>{label}</span></div>;
}
