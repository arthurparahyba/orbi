import { useEffect, useRef, useState } from 'react';
import { useFlueAgent, type FlueConversationMessage, type FlueConversationPart } from '@flue/react';
import { agentUrl, api, type ConversationInfo, type InboxItem } from '../api';
import { usePoll } from '../hooks';
import { PlusIcon, SendIcon, ToolIcon, AlertIcon, BulbIcon, ClockIcon } from '../components/Icons';
import { UiComponentView, type UiComponent } from '../components/UiComponents';
import { Markdown } from '../components/Markdown';

const TOOL_LABEL: Record<string, string> = {
  run_command: 'Comando', run_read_only_command: 'Comando (leitura)', run_python: 'Python', brain_query: 'Consulta ao cérebro',
  brain_learn: 'Aprender', browser_read: 'Navegador (leitura)', browser_act: 'Ação no navegador', playbook_start: 'Iniciar playbook',
  playbook_step: 'Passo do playbook', claude_code_prepare_fix: 'Claude Code: preparar correção', claude_code_push_fix: 'Claude Code: enviar correção',
  show_ui: 'Interface', ask_developer: 'Pergunta', schedule_followup: 'Agendar retorno', task: 'Subagente',
};

export function ConversationView({ openInbox }: { openInbox: InboxItem[] }) {
  const list = usePoll(api.conversations, 5_000);
  const [current, setCurrent] = useState<string | undefined>();

  useEffect(() => {
    if (!current && list.data?.length) setCurrent(list.data[0].id);
  }, [list.data, current]);

  const newConversation = async () => {
    const c = await api.createConversation();
    await list.reload();
    setCurrent(c.id);
  };

  return (
    <div className="conversa">
      <aside className="convs" aria-label="Conversas">
        <div className="convs-head">
          <h2>Conversas</h2>
          <button type="button" className="icon-btn" onClick={newConversation} title="Nova conversa" aria-label="Nova conversa"><PlusIcon size={16} /></button>
        </div>
        <ul>
          {(list.data ?? []).map((c: ConversationInfo) => {
            const pending = openInbox.filter((i) => i.conversationId === c.id).length;
            return (
              <li key={c.id}>
                <button type="button" className={`conv ${c.id === current ? 'active' : ''}`} onClick={() => setCurrent(c.id)}>
                  <span className="conv-title">{c.title}</span>
                  <span className="conv-meta">{new Date(c.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  {pending > 0 && <span className="badge">{pending}</span>}
                </button>
              </li>
            );
          })}
          {list.data && list.data.length === 0 && <li className="muted pad">Nenhuma conversa ainda.</li>}
        </ul>
      </aside>
      {current ? (
        <Chat key={current} id={current} title={list.data?.find((c) => c.id === current)?.title ?? ''} onTitled={list.reload} />
      ) : (
        <div className="empty-chat">
          <p>Comece uma conversa para ensinar um procedimento ao Vigia ou pedir que ele execute algo que já sabe.</p>
          <button type="button" className="btn primary" onClick={newConversation}><PlusIcon size={14} /> Nova conversa</button>
        </div>
      )}
      <InboxPanel items={openInbox} onOpen={setCurrent} />
    </div>
  );
}

const SUGGESTIONS = [
  'Vou te ensinar como subir a versão de um front no portal.',
  'Atualiza a versão do novo-front no portal para 2.4.0',
  'O que você já sabe sobre o repositório pagamentos-api?',
];

function Chat({ id, title, onTitled }: { id: string; title: string; onTitled(): void }) {
  const agent = useFlueAgent({ url: agentUrl(id) });
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const busy = agent.status === 'submitted' || agent.status === 'streaming';
  const visible = agent.messages.filter((m) => m.display !== 'hidden');

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [agent.messages]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setDraft('');
    if (title === 'Nova conversa' || !visible.some((m) => m.role === 'user')) {
      void api.renameConversation(id, t.length > 60 ? `${t.slice(0, 57)}…` : t).then(onTitled, () => {});
    }
    await agent.sendMessage(t);
  };

  return (
    <section className="chat" aria-label="Conversa com o Vigia">
      <header className="chat-head">
        <h1>{title || 'Conversa'}</h1>
        <span className={`pill pill-${busy ? 'running' : agent.status === 'error' ? 'failed' : 'idle'}`}>
          {busy ? 'Trabalhando…' : agent.status === 'error' ? 'Erro' : agent.status === 'connecting' ? 'Conectando…' : 'Pronto'}
        </span>
      </header>
      <div className="messages" aria-live="polite">
        {agent.historyReady && visible.length === 0 && (
          <div className="suggest">
            <p className="muted">O Vigia não vem sabendo fazer nada específico: ele aprende com você e guarda no cérebro. Tente:</p>
            {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        {visible.map((m) => <Message key={m.id} m={m} />)}
        {agent.status === 'submitted' && <div className="msg assistant"><span className="typing"><i /><i /><i /></span></div>}
        {agent.error && <div className="banner small" role="alert">{agent.error.message}</div>}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <label htmlFor="composer" className="sr-only">Mensagem para o Vigia</label>
        <textarea
          id="composer"
          rows={2}
          value={draft}
          placeholder="Peça algo ou ensine um procedimento…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
        />
        <button type="submit" className="btn primary icon-only" disabled={!draft.trim()} aria-label="Enviar"><SendIcon size={16} /></button>
      </form>
    </section>
  );
}

function Message({ m }: { m: FlueConversationMessage }) {
  if (m.role === 'system') {
    // Runtime plumbing (MCP availability, skill/instruction updates, approval echoes) stays out of the chat:
    // approval cards already show their outcome. Only failed turns and scheduled check-ins surface.
    if (m.settlement) return <div className="msg system err">A execução {m.settlement.outcome === 'aborted' ? 'foi interrompida' : 'falhou'}.</div>;
    if (m.signal?.tagName === 'followup' || m.signal?.attributes?.type === 'followup') {
      return <div className="msg system"><ClockIcon size={12} /> Retorno agendado</div>;
    }
    return null;
  }
  if (m.role === 'user') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return <div className="msg user"><div className="bubble">{text}</div></div>;
  }
  return (
    <div className="msg assistant">
      <div className="avatar" aria-hidden="true">V</div>
      <div className="parts">{groupParts(m.parts).map((g, i) => (Array.isArray(g) ? <ToolGroup key={i} tools={g} /> : <Part key={i} p={g} />))}</div>
    </div>
  );
}

type ToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;
/** Tools whose result is already drawn as a ui component (stepper, cards). */
const SILENT_TOOLS = new Set(['show_ui', 'playbook_start', 'playbook_step']);

/** Consecutive tool calls fold into one "atividade" row so the stepper and text stay readable. */
function groupParts(parts: FlueConversationPart[]): Array<FlueConversationPart | ToolPart[]> {
  const out: Array<FlueConversationPart | ToolPart[]> = [];
  for (const p of parts) {
    if (p.type === 'dynamic-tool') {
      if (SILENT_TOOLS.has(p.toolName) && p.state !== 'output-error') continue;
      const last = out[out.length - 1];
      if (Array.isArray(last)) last.push(p);
      else out.push([p]);
    } else out.push(p);
  }
  return out;
}

function ToolGroup({ tools }: { tools: ToolPart[] }) {
  if (tools.length === 1) return <Part p={tools[0]} />;
  const running = tools.some((t) => t.state === 'input-available');
  const failed = tools.filter((t) => t.state === 'output-error').length;
  return (
    <details className={`tool group ${running ? 'is-input-available' : failed ? 'is-output-error' : ''}`}>
      <summary>
        <ToolIcon size={13} />
        <span>{tools.length} ações: {[...new Set(tools.map((t) => TOOL_LABEL[t.toolName] ?? t.toolName))].join(', ')}</span>
        <span className="tool-state">{running ? 'executando' : failed ? `${failed} com erro` : 'ok'}</span>
      </summary>
      <div className="tool-list">{tools.map((t, i) => <Part key={i} p={t} />)}</div>
    </details>
  );
}

function Part({ p }: { p: FlueConversationPart }) {
  if (p.type === 'text') return p.text.trim() ? <Markdown text={p.text} /> : null;
  if (p.type === 'reasoning') return null;
  if (p.type === 'dynamic-tool') {
    return (
      <details className={`tool is-${p.state}`}>
        <summary>
          <ToolIcon size={13} />
          <span>{TOOL_LABEL[p.toolName] ?? p.toolName}</span>
          <span className="tool-state">{p.state === 'input-available' ? 'executando' : p.state === 'output-error' ? 'erro' : 'ok'}</span>
        </summary>
        <pre className="code small">{JSON.stringify(p.input, null, 2)}</pre>
        {p.state === 'output-available' && <pre className="code small">{typeof p.output === 'string' ? p.output : JSON.stringify(p.output, null, 2)}</pre>}
        {p.state === 'output-error' && <pre className="code small err">{p.errorText}</pre>}
      </details>
    );
  }
  if (p.type === 'data-ui') {
    const comps = ((p.data as { components?: UiComponent[] })?.components ?? []);
    return <div className="ui-stack">{comps.map((c) => <UiComponentView key={c.id} c={c} />)}</div>;
  }
  return null;
}

function InboxPanel({ items, onOpen }: { items: InboxItem[]; onOpen(id: string): void }) {
  return (
    <aside className="inbox" aria-label="Pendências">
      <h2>Pendências <span className="muted">{items.length}</span></h2>
      {items.length === 0 && <p className="muted pad">Nada esperando por você.</p>}
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className="inbox-item" onClick={() => onOpen(i.conversationId)}>
              <span className={`ui-icon ${i.kind === 'learning' ? 'info' : 'warn'}`}>{i.kind === 'learning' ? <BulbIcon size={14} /> : <AlertIcon size={14} />}</span>
              <span>
                <span className="inbox-kind">{i.kind === 'approval' ? 'Aprovação' : i.kind === 'learning' ? 'Aprendizado' : 'Pergunta'}</span>
                <span className="inbox-title">{i.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
