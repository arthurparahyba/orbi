import { api } from '../../api';
import { useLoad } from '../../hooks';
import { ModelChoice } from './ModelChoice';

/** First opening (or the model stopped working): choose, test, use. Before anything else. */
export function ModelSetup({ onDone, onLater }: { onDone(): void; onLater(): void }) {
  const status = useLoad(api.model);
  return (
    <main className="model-setup">
      <div className="model-setup-inner">
        <header>
          <span className="eyebrow">Antes de começar</span>
          <h1>Com qual modelo o Orbi vai pensar?</h1>
          <p className="muted">O Orbi precisa de um modelo de linguagem para conversar e executar os procedimentos. Escolha um; dá para trocar depois em Configurações › Modelo.</p>
          {/* A model that was set and broke says why; a first opening has nothing to explain. */}
          {status.data?.problem && (status.data.kind !== 'anthropic' || status.data.keySet) && <p className="model-result bad">Agora: {status.data.problem}.</p>}
        </header>
        {!status.data && <p className="muted">{status.error ? `Erro: ${status.error}` : 'Procurando as opções desta máquina…'}</p>}
        {status.data && <ModelChoice status={status.data} onChosen={onDone} onRescan={async () => { await api.rescanPlugins(); await status.reload(); }} />}
        <button type="button" className="link-btn muted later" onClick={onLater}>Configurar depois</button>
      </div>
    </main>
  );
}
