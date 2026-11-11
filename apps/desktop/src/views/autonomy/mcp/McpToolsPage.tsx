import { useState } from 'react';
import type { Health } from '../../../api';
import { ChromeSettingsCard } from './ChromeSettingsCard';
import { ServerList } from './ServerList';
import { AddServer } from './AddServer';
import { ServerPage } from './ServerPage';

type View = { at: 'lista' } | { at: 'adicionar' } | { at: 'servidor'; id: string } | { at: 'chrome' };

/**
 * Configurações › Ferramentas (MCP): the MCP servers Orbi uses to act on other systems
 * (docs/funcionalidades/20). The built-in Chrome DevTools, and the ones the developer adds.
 */
export function McpToolsPage({ health, onChanged }: { health?: Health; onChanged(): void }) {
  const [view, setView] = useState<View>({ at: 'lista' });
  const back = () => setView({ at: 'lista' });
  return (
    <section className="mcp-tools" aria-label="Servidores MCP">
      {view.at === 'lista' && (
        <ServerList health={health} onAdd={() => setView({ at: 'adicionar' })} onOpen={(id) => setView({ at: 'servidor', id })} onChrome={() => setView({ at: 'chrome' })} />
      )}
      {view.at === 'adicionar' && <AddServer onCancel={back} onSaved={(id) => setView({ at: 'servidor', id })} />}
      {view.at === 'servidor' && <ServerPage id={view.id} onBack={back} onRemoved={back} />}
      {view.at === 'chrome' && (
        <>
          <button type="button" className="link-btn small" onClick={back}>← Ferramentas (MCP)</button>
          <ChromeSettingsCard onSaved={onChanged} />
        </>
      )}
    </section>
  );
}
