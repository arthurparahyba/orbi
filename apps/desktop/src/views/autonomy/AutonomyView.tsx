import { useEffect, useState } from 'react';
import type { Health, InboxItem } from '../../api';
import { Usage } from './Usage';
import { Vault } from './Vault';
import { Voice } from './Voice';
import { Capabilities } from './Capabilities';
import { Rules } from './Rules';
import { CodeAgentsPage } from './codeAgents/CodeAgentsPage';
import { ModelPage } from './ModelPage';
import { AgentsView } from './agents/AgentsView';
import { McpToolsPage } from './mcp/McpToolsPage';

export type AutonomySection = 'regras' | 'cofre' | 'ferramentas' | 'pedem' | 'agentes-de-codigo' | 'modelo' | 'voz' | 'uso' | 'capacidades';

type Section = { id: AutonomySection; label: string; hint: string };
/** The sub-menu, in groups (docs/funcionalidades/20). */
const GROUPS: Array<{ label: string; sections: Section[] }> = [
  { label: 'Permissões', sections: [
    { id: 'regras', label: 'Regras', hint: 'Quanto o Orbi pode fazer sozinho, por tipo de ação. “Perguntar” cria um cartão de aprovação na conversa.' },
    { id: 'cofre', label: 'Cofre', hint: 'Credenciais que os procedimentos usam pela referência.' },
  ] },
  { label: 'Conexões', sections: [
    { id: 'ferramentas', label: 'Ferramentas (MCP)', hint: 'Servidores MCP que o Orbi usa para agir em outros sistemas. A escrita passa pelas Regras como qualquer ação.' },
    { id: 'pedem', label: 'Servidor MCP', hint: '' },
    { id: 'agentes-de-codigo', label: 'Agentes de código', hint: '' },
  ] },
  { label: 'Modelo', sections: [
    { id: 'modelo', label: 'Modelo', hint: 'O modelo de cada tipo de trabalho: conversar, executar, aprender e corrigir.' },
    { id: 'voz', label: 'Voz', hint: 'O modelo que transcreve a narração, nesta máquina.' },
  ] },
  { label: 'Acompanhar', sections: [
    { id: 'uso', label: 'Uso', hint: 'Quanto o modelo e as ferramentas foram usados.' },
    { id: 'capacidades', label: 'Capacidades', hint: 'O que está conectado e configurado.' },
  ] },
];
const SECTIONS = GROUPS.flatMap((g) => g.sections);
/** Pages that draw their own header. */
const OWN_LAYOUT: ReadonlySet<AutonomySection> = new Set(['agentes-de-codigo', 'pedem']);

/** The Autonomia screen: a sub-menu on the left, one page per part. */
export function AutonomyView({ health, focus, onModelChanged, waiting, onOpenConversation }: {
  health?: Health; focus?: { section: AutonomySection }; onModelChanged(): void; waiting: InboxItem[]; onOpenConversation(id: string): void;
}) {
  const [section, setSection] = useState<AutonomySection>(focus?.section ?? 'regras');
  useEffect(() => { if (focus) setSection(focus.section); }, [focus]);
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="autonomia-shell">
      <nav className="subnav" aria-label="Configurações">
        <h2>Configurações</h2>
        {GROUPS.map((g) => (
          <div key={g.label} className="subnav-group" role="group" aria-label={g.label}>
            <p className="subnav-label">{g.label}</p>
            {g.sections.map((s) => (
              <button key={s.id} type="button" className={`subnav-item ${s.id === section ? 'active' : ''}`} aria-current={s.id === section ? 'page' : undefined} onClick={() => setSection(s.id)}>{s.label}</button>
            ))}
          </div>
        ))}
      </nav>
      {OWN_LAYOUT.has(section) ? (
        section === 'pedem' ? <AgentsView openInbox={waiting} health={health} onOpenConversation={onOpenConversation} /> : <CodeAgentsPage />
      ) : (
        <div className="autonomia">
          <header className="brain-head">
            <div>
              <h1>{current.label}</h1>
              <p className="muted">{current.hint}</p>
            </div>
          </header>
          {section === 'regras' && <Rules />}
          {section === 'modelo' && <ModelPage onChanged={onModelChanged} />}
          {section === 'cofre' && <Vault />}
          {section === 'ferramentas' && <McpToolsPage health={health} onChanged={onModelChanged} />}
          {section === 'uso' && <Usage />}
          {section === 'voz' && <Voice />}
          {section === 'capacidades' && <Capabilities health={health} />}
        </div>
      )}
    </div>
  );
}
