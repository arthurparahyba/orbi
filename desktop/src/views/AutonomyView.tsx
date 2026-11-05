import { api, type Autonomy, type Category, type Health } from '../api';
import { usePoll } from '../hooks';
import { Segmented } from './BrainView';

const CATEGORIES: Array<{ key: Category; title: string; hint: string; locked?: Autonomy[] }> = [
  { key: 'comandos-leitura', title: 'Comandos de leitura', hint: 'git log, gh run view, aws logs… nada muda no mundo.' },
  { key: 'comandos-escrita', title: 'Comandos que alteram algo', hint: 'gh pr create/merge, git push, deploys. Um playbook em modo automático pode liberar.' },
  { key: 'navegador-leitura', title: 'Navegador: ler páginas', hint: 'Abrir, tirar snapshot, ler o portal ou o ServiceNow.' },
  { key: 'navegador-escrita', title: 'Navegador: clicar e preencher', hint: 'Preencher formulários, salvar a versão no portal, abrir GMUD.' },
  { key: 'codigo-teste', title: 'Claude Code: corrigir testes', hint: 'Correções que só tocam arquivos de teste.' },
  { key: 'codigo-producao', title: 'Claude Code: corrigir código de produção', hint: 'Sempre global; um playbook não sobrepõe.' },
  { key: 'aprender', title: 'Gravar aprendizado no cérebro', hint: 'O Vigia sempre mostra o que vai aprender e pede seu ok.', locked: ['auto'] },
];
const LABEL: Record<Autonomy, string> = { observe: 'Só observar', ask: 'Perguntar', auto: 'Automático' };

export function AutonomyView({ health }: { health?: Health }) {
  const policy = usePoll(api.autonomy, 15_000);
  return (
    <div className="autonomia">
      <header className="brain-head">
        <div>
          <h1>Autonomia</h1>
          <p className="muted">Quanto o Vigia pode fazer sozinho, por tipo de ação. “Perguntar” cria um cartão de aprovação na conversa.</p>
        </div>
      </header>
      <section className="auto-list">
        {CATEGORIES.map((c) => {
          const value = policy.data?.categories[c.key];
          return (
            <div key={c.key} className="auto-row">
              <div>
                <strong>{c.title}</strong>
                <p className="muted small">{c.hint}</p>
              </div>
              {value && (
                <Segmented
                  label={c.title}
                  value={value}
                  options={(['observe', 'ask', 'auto'] as Autonomy[]).filter((a) => !c.locked?.includes(a)).map((a) => ({ value: a, label: LABEL[a] }))}
                  onChange={async (lvl) => { await api.setAutonomy(c.key, lvl); await policy.reload(); }}
                />
              )}
            </div>
          );
        })}
      </section>
      <section className="auto-list">
        <h2>Capacidades conectadas</h2>
        <div className="auto-row"><div><strong>Modelo</strong><p className="muted small">Conversa e decisões</p></div><code>{health?.model ?? '—'}</code></div>
        <div className="auto-row"><div><strong>Claude Code</strong><p className="muted small">Correções em worktree isolada</p></div><code>{health?.codeModel ?? '—'}</code></div>
        <div className="auto-row"><div><strong>Chave da API Anthropic</strong></div><span className={`pill ${health?.anthropicKey ? 'pill-done' : 'pill-failed'}`}>{health?.anthropicKey ? 'Configurada' : 'Ausente'}</span></div>
        <div className="auto-row">
          <div><strong>Chrome DevTools MCP</strong><p className="muted small">{health && 'tools' in health.chrome ? health.chrome.url : health && 'error' in health.chrome ? health.chrome.error : ''}</p></div>
          <span className={`pill ${health && 'tools' in health.chrome ? 'pill-done' : 'pill-failed'}`}>{health && 'tools' in health.chrome ? `${health.chrome.tools} ferramentas` : 'Indisponível'}</span>
        </div>
      </section>
    </div>
  );
}
