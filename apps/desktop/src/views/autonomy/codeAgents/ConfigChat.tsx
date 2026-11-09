import { CODE_AGENTS_CHAT, configAgentUrl } from '../../../api';
import { ChatPanel, chatPill } from '../../../components/chat/ChatPanel';

const SUGGESTIONS = [
  'Vê quais agentes de código eu tenho aqui e quais modelos cada um aceita',
  'O Devin deixa escolher o modelo?',
  'Use o Haiku 5.5 para investigar',
];

/**
 * The configuration chat beside the list: the same chat as the conversations, talking to the
 * runtime's configuration agent (its own capabilities: look at this machine, propose a registration).
 */
export function ConfigChat() {
  return (
    <ChatPanel
      url={configAgentUrl(CODE_AGENTS_CHAT)}
      id={CODE_AGENTS_CHAT}
      label="Configurar agentes de código com o Orbi"
      className="chat config-chat"
      placeholder="Pergunte ou peça um ajuste nos agentes…"
      header={(c) => {
        const pill = chatPill(c);
        return (
          <header className="chat-head">
            <h2>Configurar com o Orbi</h2>
            <span className="muted small">só lê a máquina; muda com o seu ok</span>
            <span className={`pill pill-${pill.tone}`}>{pill.text}</span>
          </header>
        );
      }}
      empty={(send) => (
        <div className="suggest">
          <p className="muted">Peça para o Orbi procurar os agentes desta máquina, explicar um deles ou mudar quem faz cada tarefa. Ele propõe o cadastro num cartão.</p>
          {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
    />
  );
}
