import { useCallback, useMemo, useState } from 'react';
import { api, type InboxItem } from './api';
import { usePoll } from './hooks';
import { BrainIcon, ChatIcon, DialIcon, OrbiIcon } from './components/Icons';
import { InboxContext, type InboxActions } from './components/UiComponents';
import { ConversationView } from './views/ConversationView';
import { BrainView } from './views/BrainView';
import { AutonomyView } from './views/AutonomyView';

type Screen = 'conversa' | 'cerebro' | 'autonomia';

export function App() {
  const [screen, setScreen] = useState<Screen>('conversa');
  const health = usePoll(api.health, 10_000);
  const inbox = usePoll(() => api.inbox('all'), 2_500);

  const decide = useCallback(async (id: string, d: 'approve' | 'deny') => { await api.decide(id, d); await inbox.reload(); }, [inbox.reload]);
  const answer = useCallback(async (id: string, t: string) => { await api.answer(id, t); await inbox.reload(); }, [inbox.reload]);
  const actions = useMemo<InboxActions>(
    () => ({ items: new Map((inbox.data ?? []).map((i) => [i.id, i])), decide, answer }),
    [inbox.data, decide, answer],
  );
  const open = (inbox.data ?? []).filter((i: InboxItem) => i.status === 'open');

  const online = !health.error && !!health.data;
  const chromeOk = health.data && 'tools' in health.data.chrome;

  return (
    <InboxContext.Provider value={actions}>
      <div className="app">
        <nav className="rail" aria-label="Telas">
          <div className="brand" title="Orbi"><OrbiIcon size={20} /></div>
          <RailButton active={screen === 'conversa'} onClick={() => setScreen('conversa')} label="Conversa" badge={open.length}><ChatIcon /></RailButton>
          <RailButton active={screen === 'cerebro'} onClick={() => setScreen('cerebro')} label="Cérebro"><BrainIcon /></RailButton>
          <RailButton active={screen === 'autonomia'} onClick={() => setScreen('autonomia')} label="Autonomia"><DialIcon /></RailButton>
          <div className="rail-foot">
            <span className={`dot ${online ? 'ok' : 'bad'}`} title={online ? `Runtime conectado · ${health.data?.model}` : `Runtime offline: ${health.error ?? ''}`} />
            <span className={`dot ${chromeOk ? 'ok' : 'off'}`} title={chromeOk ? 'Chrome DevTools MCP conectado' : 'Chrome DevTools MCP indisponível'} />
          </div>
        </nav>
        <main className="screen">
          {!online && health.error && (
            <div className="banner" role="alert">
              Ainda sem resposta do runtime em 127.0.0.1:3000. O app inicia o runtime sozinho; se isso não passar em alguns segundos, veja o log em <code>~/Library/Application Support/br.com.zup.orbi/logs/runtime.log</code> (no desenvolvimento, rode <code>npm run demo</code> na raiz).
            </div>
          )}
          {screen === 'conversa' && <ConversationView openInbox={open} />}
          {screen === 'cerebro' && <BrainView />}
          {screen === 'autonomia' && <AutonomyView health={health.data} />}
        </main>
      </div>
    </InboxContext.Provider>
  );
}

function RailButton(props: { active: boolean; onClick(): void; label: string; badge?: number; children: React.ReactNode }) {
  return (
    <button type="button" className={`rail-btn ${props.active ? 'active' : ''}`} onClick={props.onClick} aria-current={props.active ? 'page' : undefined}>
      {props.children}
      <span className="rail-label">{props.label}</span>
      {!!props.badge && <span className="badge" aria-label={`${props.badge} pendências`}>{props.badge}</span>}
    </button>
  );
}
