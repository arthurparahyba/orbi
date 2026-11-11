import { api, type Autonomy, type Category } from '../../api';
import { useLive } from '../../hooks';
import { Segmented } from '../../components/Segmented';

const CATEGORIES: Array<{ key: Category; title: string; hint: string; locked?: Autonomy[] }> = [
  { key: 'comandos-leitura', title: 'Comandos de leitura', hint: 'git log, gh run view, aws logs… nada muda no mundo.' },
  { key: 'comandos-escrita', title: 'Comandos que alteram algo', hint: 'gh pr create/merge, git push, deploys. Um playbook em modo automático pode liberar.' },
  { key: 'navegador-leitura', title: 'Navegador: ler páginas', hint: 'Abrir, tirar snapshot, ler o portal ou o ServiceNow.' },
  { key: 'navegador-escrita', title: 'Navegador: clicar e preencher', hint: 'Preencher formulários, salvar a versão no portal, abrir GMUD.' },
  { key: 'codigo-teste', title: 'Agente de código: corrigir testes', hint: 'Correções que só tocam arquivos de teste.' },
  { key: 'codigo-producao', title: 'Agente de código: corrigir código de produção', hint: 'Sempre global; um playbook não sobrepõe.' },
  { key: 'aprender', title: 'Gravar aprendizado no cérebro', hint: 'O Orbi sempre mostra o que vai aprender e pede seu ok.', locked: ['auto'] },
];
/** An MCP server's two rules (docs/funcionalidades/20). Deleting never runs alone, whatever is set. */
function mcpRows(s: { id: string; name: string }): typeof CATEGORIES {
  return [
    { key: `mcp:${s.id}:leitura`, title: `${s.name}: ler`, hint: 'Ferramentas deste servidor marcadas como leitura.' },
    { key: `mcp:${s.id}:escrita`, title: `${s.name}: alterar`, hint: 'Ferramentas de escrita. As que apagam nunca rodam sozinhas.' },
  ];
}
const LABEL: Record<Autonomy, string> = { observe: 'Só observar', ask: 'Perguntar', auto: 'Automático' };

/** Autonomia › Regras: how much the Orbi may do alone, per kind of action; each MCP server has its two. */
export function Rules() {
  const policy = useLive(api.autonomy, ['autonomy', 'mcp-servers']);
  const servers = useLive(api.mcpServers, ['mcp-servers']);
  const rows = [...CATEGORIES, ...(servers.data ?? []).flatMap(mcpRows)];
  return (
    <section className="auto-list">
        {rows.map((c) => {
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
  );
}
