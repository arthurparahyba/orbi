import type { Health } from '../../api';

const INSTALL: Record<string, string> = {
  gh: 'Instale com brew install gh e rode gh auth login',
  aws: 'Instale com brew install awscli',
  git: 'Instale com xcode-select --install',
  python3: 'Instale com xcode-select --install',
};
/** What Orbi is connected to: model, Claude Code, transcription, plugins, workspace, commands, Chrome. */
export function Capabilities({ health }: { health?: Health }) {
  return (
    <section className="auto-list">
      <h2>Capacidades conectadas</h2>
      <div className="auto-row"><div><strong>Modelo</strong><p className="muted small">Conversa e decisões</p></div><code>{health?.model ?? '—'}</code></div>
      <div className="auto-row"><div><strong>Claude Code</strong><p className="muted small">{health?.codeFixer === false ? 'Desligado: precisa da API da Anthropic (ORBI_CODE_FIXER=claude-code para forçar)' : 'Correções em worktree isolada'}</p></div>{health?.codeFixer === false ? <span className="pill pill-failed">Desligado</span> : <code>{health?.codeModel ?? '—'}</code>}</div>
      <div className="auto-row"><div><strong>Transcrição da narração</strong><p className="muted small">Áudio das demonstrações</p></div><code>{health?.stt ?? '—'}</code></div>
      <div className="auto-row"><div><strong>Provedor de LLM</strong><p className="muted small">{health?.llm && health.llm !== 'anthropic' ? 'Adaptador configurado em ORBI_LLM' : 'Anthropic (padrão). Para outro provedor, veja docs/funcionalidades/12-modelo-e-plugins.md'}</p></div><code>{health?.llm ?? '—'}</code></div>
      {(health?.plugins ?? []).map((p) => (
        <div key={p.dir} className="auto-row">
          <div><strong>Plugin {p.name}</strong><p className="muted small">{p.error ?? p.description ?? p.kind} · {p.dir}</p></div>
          <span className={`pill ${p.error ? 'pill-failed' : p.name === health?.llm ? 'pill-done' : ''}`}>{p.error ? 'Com erro' : p.name === health?.llm ? 'Ativo' : 'Disponível'}</span>
        </div>
      ))}
      {(!health?.llm || health.llm === 'anthropic') && (
        <div className="auto-row"><div><strong>Chave da API Anthropic</strong>{!health?.anthropicKey && health?.envFile && <p className="muted small">Coloque <code>ANTHROPIC_API_KEY=…</code> em <code>{health.envFile}</code> e reabra o app.</p>}</div><span className={`pill ${health?.anthropicKey ? 'pill-done' : 'pill-failed'}`}>{health?.anthropicKey ? 'Configurada' : 'Ausente'}</span></div>
      )}
      <div className="auto-row"><div><strong>Pasta de trabalho</strong><p className="muted small">Onde os comandos rodam e os repositórios são clonados (ORBI_WORKSPACE)</p></div><code>{health?.workspace ?? '—'}</code></div>
      {Object.entries(health?.binaries ?? {}).map(([bin, at]) => (
        <div key={bin} className="auto-row">
          <div><strong>{bin}</strong><p className="muted small">{at ?? INSTALL[bin] ?? 'não encontrado no PATH'}</p></div>
          <span className={`pill ${at ? 'pill-done' : 'pill-failed'}`}>{at ? 'Encontrado' : 'Não instalado'}</span>
        </div>
      ))}
      <div className="auto-row">
        <div><strong>Chrome DevTools MCP</strong><p className="muted small">{health && 'tools' in health.chrome ? health.chrome.url : health && 'error' in health.chrome ? health.chrome.error : ''}</p></div>
        <span className={`pill ${health && 'tools' in health.chrome ? 'pill-done' : 'pill-failed'}`}>{health && 'tools' in health.chrome ? `${health.chrome.tools} ferramentas` : 'Indisponível'}</span>
      </div>
    </section>
  );
}
