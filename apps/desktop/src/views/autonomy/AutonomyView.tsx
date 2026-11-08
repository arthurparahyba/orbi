import { api, type Autonomy, type Category, type Health } from '../../api';
import { useLive } from '../../hooks';
import { Segmented } from '../../components/Segmented';
import { Usage } from './Usage';
import { Vault } from './Vault';
import { Voice } from './Voice';
import { Capabilities } from './Capabilities';

const CATEGORIES: Array<{ key: Category; title: string; hint: string; locked?: Autonomy[] }> = [
  { key: 'comandos-leitura', title: 'Comandos de leitura', hint: 'git log, gh run view, aws logs… nada muda no mundo.' },
  { key: 'comandos-escrita', title: 'Comandos que alteram algo', hint: 'gh pr create/merge, git push, deploys. Um playbook em modo automático pode liberar.' },
  { key: 'navegador-leitura', title: 'Navegador: ler páginas', hint: 'Abrir, tirar snapshot, ler o portal ou o ServiceNow.' },
  { key: 'navegador-escrita', title: 'Navegador: clicar e preencher', hint: 'Preencher formulários, salvar a versão no portal, abrir GMUD.' },
  { key: 'codigo-teste', title: 'Claude Code: corrigir testes', hint: 'Correções que só tocam arquivos de teste.' },
  { key: 'codigo-producao', title: 'Claude Code: corrigir código de produção', hint: 'Sempre global; um playbook não sobrepõe.' },
  { key: 'aprender', title: 'Gravar aprendizado no cérebro', hint: 'O Orbi sempre mostra o que vai aprender e pede seu ok.', locked: ['auto'] },
];
const LABEL: Record<Autonomy, string> = { observe: 'Só observar', ask: 'Perguntar', auto: 'Automático' };

/** The Autonomia screen: how much Orbi may do alone, what it has used, its vault and capabilities. */
export function AutonomyView({ health }: { health?: Health }) {
  const policy = useLive(api.autonomy, ['autonomy']);
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
      <Usage />
      <Vault />
      <Voice />
      <Capabilities health={health} />
    </div>
  );
}
