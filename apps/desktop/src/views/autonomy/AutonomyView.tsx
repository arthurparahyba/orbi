import { useEffect, useState } from 'react';
import type { Health } from '../../api';
import { Usage } from './Usage';
import { Vault } from './Vault';
import { Voice } from './Voice';
import { Capabilities } from './Capabilities';
import { Rules } from './Rules';
import { CodeAgentsPage } from './codeAgents/CodeAgentsPage';
import { ModelPage } from './ModelPage';

export type AutonomySection = 'regras' | 'modelo' | 'agentes-de-codigo' | 'cofre' | 'uso' | 'voz' | 'capacidades';

const SECTIONS: Array<{ id: AutonomySection; label: string; hint: string }> = [
  { id: 'regras', label: 'Regras', hint: 'Quanto o Orbi pode fazer sozinho, por tipo de ação. “Perguntar” cria um cartão de aprovação na conversa.' },
  { id: 'modelo', label: 'Modelo', hint: 'O modelo com que o Orbi conversa e executa os procedimentos.' },
  { id: 'agentes-de-codigo', label: 'Agentes de código', hint: '' },
  { id: 'cofre', label: 'Cofre', hint: 'Credenciais que os procedimentos usam pela referência.' },
  { id: 'uso', label: 'Uso', hint: 'Quanto o modelo e as ferramentas foram usados.' },
  { id: 'voz', label: 'Voz', hint: 'O modelo que transcreve a narração, nesta máquina.' },
  { id: 'capacidades', label: 'Capacidades', hint: 'O que está conectado e configurado.' },
];

/** The Autonomia screen: a sub-menu on the left, one page per part. */
export function AutonomyView({ health, focus, onModelChanged }: { health?: Health; focus?: { section: AutonomySection }; onModelChanged(): void }) {
  const [section, setSection] = useState<AutonomySection>(focus?.section ?? 'regras');
  useEffect(() => { if (focus) setSection(focus.section); }, [focus]);
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="autonomia-shell">
      <nav className="subnav" aria-label="Autonomia">
        <h2>Autonomia</h2>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={`subnav-item ${s.id === section ? 'active' : ''}`} aria-current={s.id === section ? 'page' : undefined} onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </nav>
      {section === 'agentes-de-codigo' ? (
        <CodeAgentsPage />
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
          {section === 'uso' && <Usage />}
          {section === 'voz' && <Voice />}
          {section === 'capacidades' && <Capabilities health={health} />}
        </div>
      )}
    </div>
  );
}
