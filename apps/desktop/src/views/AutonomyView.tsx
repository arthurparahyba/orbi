import { useState } from 'react';
import { api, type Autonomy, type Category, type Health, type SecretInfo } from '../api';
import { usePoll } from '../hooks';
import { Segmented } from './BrainView';

const CATEGORIES: Array<{ key: Category; title: string; hint: string; locked?: Autonomy[] }> = [
  { key: 'comandos-leitura', title: 'Comandos de leitura', hint: 'git log, gh run view, aws logs… nada muda no mundo.' },
  { key: 'comandos-escrita', title: 'Comandos que alteram algo', hint: 'gh pr create/merge, git push, deploys. Um playbook em modo automático pode liberar.' },
  { key: 'navegador-leitura', title: 'Navegador: ler páginas', hint: 'Abrir, tirar snapshot, ler o portal ou o ServiceNow.' },
  { key: 'navegador-escrita', title: 'Navegador: clicar e preencher', hint: 'Preencher formulários, salvar a versão no portal, abrir GMUD.' },
  { key: 'codigo-teste', title: 'Claude Code: corrigir testes', hint: 'Correções que só tocam arquivos de teste.' },
  { key: 'codigo-producao', title: 'Claude Code: corrigir código de produção', hint: 'Sempre global; um playbook não sobrepõe.' },
  { key: 'aprender', title: 'Gravar aprendizado no cérebro', hint: 'O Orbi sempre mostra o que vai aprender e pede seu ok.', locked: ['auto'] },
];
const INSTALL: Record<string, string> = {
  gh: 'Instale com brew install gh e rode gh auth login',
  aws: 'Instale com brew install awscli',
  git: 'Instale com xcode-select --install',
  python3: 'Instale com xcode-select --install',
};
const LABEL: Record<Autonomy, string> = { observe: 'Só observar', ask: 'Perguntar', auto: 'Automático' };

export function AutonomyView({ health }: { health?: Health }) {
  const policy = usePoll(api.autonomy, 15_000);
  return (
    <div className="autonomia">
      <header className="brain-head">
        <div>
          <h1>Autonomia</h1>
          <p className="muted">Quanto o Orbi pode fazer sozinho, por tipo de ação. “Perguntar” cria um cartão de aprovação na conversa.</p>
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
      <Vault />
      <section className="auto-list">
        <h2>Capacidades conectadas</h2>
        <div className="auto-row"><div><strong>Modelo</strong><p className="muted small">Conversa e decisões</p></div><code>{health?.model ?? '—'}</code></div>
        <div className="auto-row"><div><strong>Claude Code</strong><p className="muted small">Correções em worktree isolada</p></div><code>{health?.codeModel ?? '—'}</code></div>
        <div className="auto-row"><div><strong>Transcrição da narração</strong><p className="muted small">Áudio das demonstrações</p></div><code>{health?.stt ?? '—'}</code></div>
        <div className="auto-row"><div><strong>Chave da API Anthropic</strong>{!health?.anthropicKey && health?.envFile && <p className="muted small">Coloque <code>ANTHROPIC_API_KEY=…</code> em <code>{health.envFile}</code> e reabra o app.</p>}</div><span className={`pill ${health?.anthropicKey ? 'pill-done' : 'pill-failed'}`}>{health?.anthropicKey ? 'Configurada' : 'Ausente'}</span></div>
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
    </div>
  );
}

function Vault() {
  const vault = usePoll(api.vault, 5_000);
  const [editing, setEditing] = useState<string>();
  const [value, setValue] = useState('');
  const save = async (name: string) => { await api.setSecret(name, value); setEditing(undefined); setValue(''); await vault.reload(); };
  const remove = async (s: SecretInfo) => { await api.deleteSecret(s.name); await vault.reload(); };
  return (
    <section className="auto-list">
      <h2>Cofre de credenciais</h2>
      <p className="muted small pad-x16">
        {vault.data?.backend === 'keychain'
          ? 'Guardadas no cofre do sistema (Keychain no macOS). '
          : 'Guardadas num arquivo criptografado (AES-256) na pasta de dados. '}
        Os playbooks só têm a referência; o valor é usado dentro da ação do navegador e nunca chega ao modelo nem ao cérebro.
      </p>
      {vault.data?.secrets.length === 0 && <div className="auto-row muted">Nenhuma credencial ainda. Elas entram aqui quando você digita uma senha durante uma demonstração.</div>}
      {vault.data?.secrets.map((s) => (
        <div key={s.name} className="auto-row vault-row">
          <div>
            <strong>{s.description || s.name}</strong>
            <p className="muted small"><code>{`{{segredo:${s.name}}}`}</code> · {s.origin}</p>
          </div>
          {editing === s.name ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); void save(s.name); }}>
              <label className="sr-only" htmlFor={`v-${s.name}`}>Novo valor</label>
              <input id={`v-${s.name}`} type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="off" />
              <button type="submit" className="btn small primary" disabled={!value}>Salvar</button>
              <button type="button" className="btn small" onClick={() => setEditing(undefined)}>Cancelar</button>
            </form>
          ) : (
            <div className="row">
              <button type="button" className="btn small" onClick={() => { setEditing(s.name); setValue(''); }}>Trocar valor</button>
              <button type="button" className="btn small" onClick={() => remove(s)}>Remover</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
