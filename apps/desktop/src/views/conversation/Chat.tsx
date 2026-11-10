import { useEffect, useState } from 'react';
import { agentUrl, api, type Recording } from '../../api';
import { useLive, usePoll } from '../../hooks';
import { CheckIcon, CopyIcon, RecordIcon, TrashIcon } from '../../components/Icons';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { OriginBanner } from './OriginBanner';
import { PipelineBar } from './PipelineBar';
import type { ConversationOrigin } from '../../api';
import { StartDemonstration } from '../../components/Demonstration';
import { RecordingPanel } from '../../components/RecordingPanel';
import type { Narrator } from '../../audio';
import { conversationMarkdown } from '../../components/chat/transcript';
import { ChatPanel, chatPill } from '../../components/chat/ChatPanel';
import { followupPill } from './followups';

const SUGGESTIONS = [
  'Ensinar pelo navegador',
  'Vou te ensinar como subir a versão de um front no portal.',
  'Atualiza a versão do novo-front no portal para 2.4.0',
  'O que você já sabe sobre o repositório pagamentos-api?',
];

type Demo = { mode: 'start' } | { mode: 'live'; rec: Recording; narrator?: Narrator };

/** One conversation with Orbi: the shared chat plus what only conversations have (delivery bar, teaching, delete). */
export function Chat({ id, title, origin, target, onTitled, onDeleted }: { id: string; title: string; origin?: ConversationOrigin; target?: { inboxId: string; n: number }; onTitled(): void; onDeleted(): void }) {
  const [deleting, setDeleting] = useState(false);
  const followup = useLive(() => api.followups(id), ['followups'], [id]);
  const [demo, setDemo] = useState<Demo | undefined>();

  // Back to a conversation with a recording still running (e.g. after a reload).
  useEffect(() => {
    api.activeRecording().then((r) => { if (r && r.conversationId === id) setDemo({ mode: 'live', rec: r }); }, () => {});
  }, [id]);

  const beforeSend = (t: string, first: boolean) => {
    if (t === 'Ensinar pelo navegador') { setDemo({ mode: 'start' }); return false; }
    if (title === 'Nova conversa' || first) {
      void api.renameConversation(id, t.length > 60 ? `${t.slice(0, 57)}…` : t).then(onTitled, () => {});
    }
    return true;
  };

  return (
    <ChatPanel
      url={agentUrl(id)}
      id={id}
      label="Conversa com o Orbi"
      target={target}
      beforeSend={beforeSend}
      header={(c) => {
        // Not working and a follow-up waits: say when it comes back, not "Pronto".
        const pill = (!c.busy && !c.catchingUp && followupPill(followup.data?.[0])) || chatPill(c);
        return (
          <header className="chat-head">
            <h1>{title || 'Conversa'}</h1>
            <CopyButton disabled={c.visible.length === 0} text={() => conversationMarkdown({ id, title }, c.messages)} />
            <button type="button" className="btn small" onClick={() => setDemo({ mode: 'start' })} disabled={!!demo} title="Mostre o procedimento no navegador e o Orbi aprende">
              <RecordIcon size={13} /> Ensinar pelo navegador
            </button>
            <button type="button" className="icon-btn" onClick={() => setDeleting(true)} title="Apagar conversa" aria-label="Apagar conversa"><TrashIcon size={15} /></button>
            <span className={`pill pill-${pill.tone}`}>{pill.text}</span>
          </header>
        );
      }}
      above={(
        <>
          {deleting && (
            <div className="chat-confirm">
              <ConfirmDelete
                what="esta conversa"
                consequences={[
                  'As mensagens somem agora; o histórico interno é apagado na próxima vez que o Orbi iniciar.',
                  'Pendências desta conversa saem do painel.',
                  'O que o Orbi aprendeu e as execuções continuam no Cérebro.',
                  ...(origin ? [`${origin.agent} vê o pedido como encerrado.`] : []),
                ]}
                onConfirm={async () => { await api.deleteConversation(id); onDeleted(); }}
                onCancel={() => setDeleting(false)}
              />
            </div>
          )}
          {origin && <OriginBanner origin={origin} />}
          <PipelineBar conversationId={id} />
        </>
      )}
      empty={(send) => (
        <div className="suggest">
          <p className="muted">O Orbi não vem sabendo fazer nada específico: ele aprende com você e guarda no cérebro. Tente:</p>
          {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      dock={demo && <DemoDock id={id} demo={demo} onChange={setDemo} />}
    />
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
