import { useCallback, useMemo, useState } from 'react';
import { announceSent } from './components/chat/catchUp';
import { api, type InboxItem } from './api';
import { useLive, usePoll } from './hooks';
import { BrainIcon, ChatIcon, DialIcon, OrbiIcon, PipelineIcon, PlugIcon } from './components/Icons';
import { InboxContext, type InboxActions } from './components/UiComponents';
import { needsYou } from './views/conversation/inbox';
import { ConversationView } from './views/conversation/ConversationView';
import { BrainView } from './views/brain/BrainView';
import { AutonomyView, type AutonomySection } from './views/autonomy/AutonomyView';
import { AgentsView } from './views/agents/AgentsView';
import { PipelinesView } from './views/pipelines/PipelinesView';
import { Splash, booted } from './components/Splash';
import { ModelSetup } from './views/setup/ModelSetup';

type Screen = 'conversa' | 'esteiras' | 'cerebro' | 'agentes' | 'autonomia';

export function App() {
  const [screen, setScreen] = useState<Screen>('conversa');
  const health = usePoll(api.health, 10_000);
  const inbox = useLive(() => api.inbox('all'), ['inbox']);
  const suggestions = useLive(() => api.suggestions('open'), ['agents', 'brain']);
  const activeRuns = useLive(() => api.pipelineRuns(true), ['pipelines']);
  const waitingPipelines = activeRuns.data?.filter((r) => r.status === 'waiting').length;
  // "Abrir conversa" on the Agentes screen jumps to Conversa with that one open.
  const [focus, setFocus] = useState<{ id: string } | undefined>();
  const openConversation = (id: string) => { setFocus({ id }); setScreen('conversa'); };
  // A configuration chat (config:…) lives on its Autonomia page.
  const [autonomyFocus, setAutonomyFocus] = useState<{ section: AutonomySection }>();
  const openCodeAgents = () => { setAutonomyFocus({ section: 'agentes-de-codigo' }); setScreen('autonomia'); };
  const openModel = () => { setAutonomyFocus({ section: 'modelo' }); setScreen('autonomia'); };
  // No model yet (first opening, or the key stopped working): choose one before anything else.
  const [later, setLater] = useState(false);

  // The conversation the answer or decision went to follows the turn it starts (catchUp.ts).
  const conversationOf = (id: string) => inbox.data?.find((i) => i.id === id)?.conversationId;
  const decide = useCallback(async (id: string, d: 'approve' | 'deny') => {
    await api.decide(id, d);
    const conv = conversationOf(id);
    if (conv) announceSent(conv);
    await inbox.reload();
  }, [inbox.reload, inbox.data]);
  const answer = useCallback(async (id: string, t: string) => {
    await api.answer(id, t);
    const conv = conversationOf(id);
    if (conv) announceSent(conv);
    await inbox.reload();
  }, [inbox.reload, inbox.data]);
  const actions = useMemo<InboxActions>(
    () => ({ items: new Map((inbox.data ?? []).map((i) => [i.id, i])), decide, answer }),
    [inbox.data, decide, answer],
  );
  const open = (inbox.data ?? []).filter((i: InboxItem) => i.status === 'open');
  // Notes (a level went up) inform and wait for nothing: they do not count as "esperando você".
  const waiting = open.filter(needsYou);

  const online = !health.error && !!health.data;
  const chromeOk = health.data && 'tools' in health.data.chrome;

  // Until the runtime answers and the first data arrives: a loading screen, not empty screens.
  if (!booted({ health: health.data, inbox: inbox.data })) return <Splash error={health.error} />;
  const noModel = health.data?.llmReady === false;
  if (noModel && !later) return <ModelSetup onDone={() => void health.reload()} onLater={() => setLater(true)} />;

  return (
    <InboxContext.Provider value={actions}>
      <div className="app">
        <nav className="rail" aria-label="Telas">
          <div className="brand" title="Orbi"><OrbiIcon size={20} /></div>
          <RailButton active={screen === 'conversa'} onClick={() => setScreen('conversa')} label="Conversa" badge={waiting.length}><ChatIcon /></RailButton>
          <RailButton active={screen === 'esteiras'} onClick={() => setScreen('esteiras')} label="Esteiras" badge={waitingPipelines} badgeLabel="entregas esperando você"><PipelineIcon /></RailButton>
          <RailButton active={screen === 'cerebro'} onClick={() => setScreen('cerebro')} label="Cérebro"><BrainIcon /></RailButton>
          <RailButton active={screen === 'agentes'} onClick={() => setScreen('agentes')} label="Agentes" badge={suggestions.data?.length} badgeLabel="sugestões"><PlugIcon /></RailButton>
          <RailButton active={screen === 'autonomia'} onClick={() => setScreen('autonomia')} label="Autonomia"><DialIcon /></RailButton>
          <div className="rail-foot">
            <span className={`dot ${online ? 'ok' : 'bad'}`} title={online ? `Runtime conectado · ${health.data?.model}` : `Runtime offline: ${health.error ?? ''}`} />
            <span className={`dot ${chromeOk ? 'ok' : 'off'}`} title={chromeOk ? 'Chrome DevTools MCP conectado' : 'Chrome DevTools MCP indisponível'} />
          </div>
        </nav>
        <main className="screen">
          {noModel && (
            <div className="banner model-banner" role="alert">
              <span>O Orbi está sem modelo: as conversas esperam até você configurar.</span>
              <button type="button" className="btn small primary" onClick={openModel}>Configurar o modelo</button>
            </div>
          )}
          {!online && health.error && (
            <div className="banner" role="alert">
              Ainda sem resposta do runtime em 127.0.0.1:3000. O app inicia o runtime sozinho; se isso não passar em alguns segundos, veja o log em <code>~/Library/Application Support/br.com.zup.orbi/logs/runtime.log</code> (no desenvolvimento, rode <code>npm run demo</code> na raiz).
            </div>
          )}
          {screen === 'conversa' && <ConversationView openInbox={open} focus={focus} onOpenConfig={openCodeAgents} />}
          {screen === 'esteiras' && <PipelinesView onOpenConversation={openConversation} />}
          {screen === 'cerebro' && <BrainView />}
          {screen === 'agentes' && <AgentsView openInbox={waiting} health={health.data} onOpenConversation={openConversation} />}
          {screen === 'autonomia' && <AutonomyView health={health.data} focus={autonomyFocus} onModelChanged={() => void health.reload()} />}
        </main>
      </div>
    </InboxContext.Provider>
  );
}

function RailButton(props: { active: boolean; onClick(): void; label: string; badge?: number; badgeLabel?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`rail-btn ${props.active ? 'active' : ''}`} onClick={props.onClick} aria-current={props.active ? 'page' : undefined}>
      {props.children}
      <span className="rail-label">{props.label}</span>
      {!!props.badge && <span className="badge" aria-label={`${props.badge} ${props.badgeLabel ?? 'pendências'}`}>{props.badge}</span>}
    </button>
  );
}
