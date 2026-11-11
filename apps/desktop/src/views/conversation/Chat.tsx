import { useEffect, useState } from 'react';
import { agentUrl, api, type Recording } from '../../api';
import { useLive, usePoll } from '../../hooks';
import { BellIcon, RecordIcon } from '../../components/Icons';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { OriginBanner } from './OriginBanner';
import { PipelineBar } from './PipelineBar';
import type { ConversationOrigin, ConversationState } from '../../api';
import { StartDemonstration } from '../../components/Demonstration';
import { RecordingPanel } from '../../components/RecordingPanel';
import type { Narrator } from '../../audio';
import { conversationMarkdown } from '../../components/chat/transcript';
import { ChatPanel, chatPill } from '../../components/chat/ChatPanel';
import { followupPill } from './followups';
import { ChatMenu } from './ChatMenu';
import { StageBar } from './StageBar';
import { TeachStart } from './TeachStart';
import { stateLine } from './stage';
import { ModelPicker } from '../../components/model/ModelPicker';

type Demo = { mode: 'start' } | { mode: 'live'; rec: Recording; narrator?: Narrator };

/**
 * One conversation with Orbi: the shared chat plus what only conversations have — where the
 * teaching is (stage bar), Pendências, showing in the browser, the delivery bar, copy and delete.
 */
export function Chat({ id, title, origin, state, model, target, waiting, inboxOpen, onToggleInbox, onTitled, onDeleted }: {
  id: string; title: string; origin?: ConversationOrigin; state: ConversationState; model?: string; target?: { inboxId: string; n: number };
  waiting: number; inboxOpen: boolean; onToggleInbox(): void; onTitled(): void; onDeleted(): void;
}) {
  const [deleting, setDeleting] = useState(false);
  const followup = useLive(() => api.followups(id), ['followups'], [id]);
  const [demo, setDemo] = useState<Demo | undefined>();

  // Back to a conversation with a recording still running (e.g. after a reload).
  useEffect(() => {
    api.activeRecording().then((r) => { if (r && r.conversationId === id) setDemo({ mode: 'live', rec: r }); }, () => {});
  }, [id]);

  const beforeSend = (t: string, first: boolean) => {
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
            <div className="chat-title">
              <h1>{title || 'Nova conversa'}</h1>
              {state.mode !== 'conversa' && <span className="muted">{stateLine(state)}</span>}
            </div>
            <span className={`pill pill-${pill.tone}`}>{pill.text}</span>
            <button type="button" className="btn small" onClick={() => setDemo({ mode: 'start' })} disabled={!!demo} title="Mostre o procedimento no navegador e o Orbi aprende">
              <RecordIcon size={13} /> Mostrar no navegador
            </button>
            <button type="button" className={`btn small ${inboxOpen ? 'on' : ''}`} onClick={onToggleInbox} aria-pressed={inboxOpen} title="O que espera por você em todas as conversas">
              <BellIcon size={13} /> Pendências {waiting > 0 && <span className="badge">{waiting}</span>}
            </button>
            <ChatMenu canCopy={c.visible.length > 0} copy={() => conversationMarkdown({ id, title }, c.messages)} onDelete={() => setDeleting(true)} />
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
          <StageBar state={state} />
          {origin && <OriginBanner origin={origin} />}
          <PipelineBar conversationId={id} />
        </>
      )}
      placeholder="Peça algo, ou explique como você faz…"
      composerFooter={<ModelPicker conversationId={id} chosen={model} onChosen={onTitled} />}
      empty={() => <TeachStart onShow={() => setDemo({ mode: 'start' })} />}
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
