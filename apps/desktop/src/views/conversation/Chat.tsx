import { useEffect, useRef, useState } from 'react';
import { useFlueAgent } from '@flue/react';
import { agentUrl, api, type Recording } from '../../api';
import { useChanges, usePoll } from '../../hooks';
import { CheckIcon, CopyIcon, RecordIcon, SendIcon } from '../../components/Icons';
import { OriginBanner } from './OriginBanner';
import type { ConversationOrigin } from '../../api';
import { StartDemonstration } from '../../components/Demonstration';
import { RecordingPanel } from '../../components/RecordingPanel';
import type { Narrator } from '../../audio';
import { Message } from './Message';
import { conversationMarkdown } from './transcript';
import { ChatContext } from '../../components/ChatContext';

const SUGGESTIONS = [
  'Ensinar pelo navegador',
  'Vou te ensinar como subir a versão de um front no portal.',
  'Atualiza a versão do novo-front no portal para 2.4.0',
  'O que você já sabe sobre o repositório pagamentos-api?',
];

type Demo = { mode: 'start' } | { mode: 'live'; rec: Recording; narrator?: Narrator };

/** One conversation with Orbi: messages, the browser-teaching dock and the composer. */
export function Chat({ id, title, origin, onTitled }: { id: string; title: string; origin?: ConversationOrigin; onTitled(): void }) {
  const agent = useFlueAgent({ url: agentUrl(id) });
  const [demo, setDemo] = useState<Demo | undefined>();
  const endRef = useRef<HTMLDivElement>(null);
  const busy = agent.status === 'submitted' || agent.status === 'streaming';
  const visible = agent.messages.filter((m) => m.display !== 'hidden');

  // Back to a conversation with a recording still running (e.g. after a reload).
  useEffect(() => {
    api.activeRecording().then((r) => { if (r && r.conversationId === id) setDemo({ mode: 'live', rec: r }); }, () => {});
  }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [agent.messages]);

  // A conversation can start out-of-band (a demonstration dispatched by the runtime, a scheduled
  // follow-up): when the runtime says it wrote to this one and we show nothing yet, fetch it.
  const { refresh, status, messages } = agent;
  useChanges((c) => {
    if (c.topic === 'dispatched' && c.id === id && status === 'idle' && messages.length === 0) void refresh();
  });

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (t === 'Ensinar pelo navegador') { setDemo({ mode: 'start' }); return; }
    if (title === 'Nova conversa' || !visible.some((m) => m.role === 'user')) {
      void api.renameConversation(id, t.length > 60 ? `${t.slice(0, 57)}…` : t).then(onTitled, () => {});
    }
    await agent.sendMessage(t);
  };

  return (
    <section className="chat" aria-label="Conversa com o Orbi">
      <header className="chat-head">
        <h1>{title || 'Conversa'}</h1>
        <CopyButton disabled={visible.length === 0} text={() => conversationMarkdown({ id, title }, agent.messages)} />
        <button type="button" className="btn small" onClick={() => setDemo({ mode: 'start' })} disabled={!!demo} title="Mostre o procedimento no navegador e o Orbi aprende">
          <RecordIcon size={13} /> Ensinar pelo navegador
        </button>
        <span className={`pill pill-${busy ? 'running' : agent.status === 'error' ? 'failed' : 'idle'}`}>
          {busy ? 'Trabalhando…' : agent.status === 'error' ? 'Erro' : agent.status === 'connecting' ? 'Conectando…' : 'Pronto'}
        </span>
      </header>
      {origin && <OriginBanner origin={origin} />}
      <ChatContext.Provider value={{ send: (t) => void send(t) }}>
      <div className="messages" aria-live="polite">
        {agent.historyReady && visible.length === 0 && (
          <div className="suggest">
            <p className="muted">O Orbi não vem sabendo fazer nada específico: ele aprende com você e guarda no cérebro. Tente:</p>
            {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        {visible.map((m) => <Message key={m.id} m={m} />)}
        {agent.status === 'submitted' && <div className="msg assistant"><span className="typing"><i /><i /><i /></span></div>}
        {agent.error && <div className="banner small" role="alert">{agent.error.message}</div>}
        <div ref={endRef} />
      </div>
      </ChatContext.Provider>
      {demo && <DemoDock id={id} demo={demo} onChange={setDemo} />}
      <Composer onSend={send} />
    </section>
  );
}

/** Teaching through the browser: first the start form, then the live recording. */
function DemoDock({ id, demo, onChange }: { id: string; demo: Demo; onChange(d: Demo | undefined): void }) {
  const health = usePoll(api.health, 30_000);
  return (
    <div className="demo-dock">
      {demo.mode === 'start' ? (
        <StartDemonstration
          conversationId={id}
          defaultUrl={health.data?.demoPortal}
          onCancel={() => onChange(undefined)}
          onStarted={(rec, narrator) => onChange({ mode: 'live', rec, narrator })}
        />
      ) : (
        <RecordingPanel initial={demo.rec} narrator={demo.narrator} onClosed={() => onChange(undefined)} />
      )}
    </div>
  );
}

/** The message box: Enter sends, Shift+Enter breaks the line. */
function Composer({ onSend }: { onSend(text: string): Promise<void> }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (!draft.trim()) return;
    const text = draft;
    setDraft('');
    void onSend(text);
  };
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label htmlFor="composer" className="sr-only">Mensagem para o Orbi</label>
      <textarea
        id="composer"
        rows={2}
        value={draft}
        placeholder="Peça algo ou ensine um procedimento…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
      />
      <button type="submit" className="btn primary icon-only" disabled={!draft.trim()} aria-label="Enviar"><SendIcon size={16} /></button>
    </form>
  );
}

/** Copies the whole conversation as Markdown; confirms for a moment. */
function CopyButton({ text, disabled }: { text(): string; disabled: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1800);
  };
  return (
    <button type="button" className="btn small" onClick={copy} disabled={disabled} title="Copia a conversa inteira em Markdown: mensagens, ferramentas, cartões e erros">
      {state === 'copied' ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      <span aria-live="polite">{state === 'copied' ? 'Copiada' : state === 'failed' ? 'Não deu para copiar' : 'Copiar conversa'}</span>
    </button>
  );
}
