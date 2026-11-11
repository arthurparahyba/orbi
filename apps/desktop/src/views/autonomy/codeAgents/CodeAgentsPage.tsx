import { CodeAgents } from './CodeAgents';
import { ConfigChat } from './ConfigChat';

/**
 * Configurações › Agentes de código: the list and the tasks on the left, the configuration chat in a
 * column on the right, the full height of the screen.
 */
export function CodeAgentsPage() {
  return (
    <div className="ca-page">
      <div className="ca-main">
        <header className="brain-head">
          <div>
            <h1>Agentes de código</h1>
            <p className="muted">Quando uma esteira ou um procedimento quebra por causa de código, o Orbi pede a um destes agentes para investigar ou corrigir, numa cópia descartável do repositório. Ele nunca faz commit nem vê credenciais: quem aplica é o Orbi, pelas regras de autonomia.</p>
          </div>
        </header>
        <CodeAgents />
      </div>
      <aside className="ca-chat" aria-label="Configurar com o Orbi">
        <ConfigChat />
      </aside>
    </div>
  );
}
