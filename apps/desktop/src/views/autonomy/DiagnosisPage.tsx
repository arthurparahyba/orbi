import { api, type DiagnosisSetup, type CodeAgentsState } from '../../api';
import { useLive } from '../../hooks';

const WHO: Array<{ id: DiagnosisSetup['who']; label: string; hint: string }> = [
  { id: 'regras', label: 'Só regras', hint: 'Sem modelo nenhum: só o que os detectores acham. Não gasta nada.' },
  { id: 'modelo', label: 'Modelo do Orbi', hint: 'O modelo mais barato escreve o relatório. Não lê o código do Orbi.' },
  { id: 'agente', label: 'Agente instalado', hint: 'Lê o código do Orbi e confirma a causa, com arquivo e linha. Usa a sua assinatura.' },
];
const WHEN: Array<{ id: DiagnosisSetup['when']; label: string }> = [
  { id: 'quando-houver', label: 'Quando as regras acharem algo' },
  { id: 'so-pedindo', label: 'Só quando eu pedir' },
  { id: 'sempre', label: 'Em toda execução' },
];

/**
 * Quem escreve o relatório do diagnóstico e quando (docs/funcionalidades/24). Os detectores rodam
 * sempre e de graça; o relatório é o que explica os achados juntos, e custa.
 */
export function DiagnosisPage() {
  const setup = useLive(api.diagnosisSetup, ['autonomy']);
  const agents = useLive<CodeAgentsState>(api.codeAgents, ['code-agents']);
  if (!setup.data) return <p className="muted small">Carregando…</p>;
  const save = (next: Partial<DiagnosisSetup>) => void api.setDiagnosisSetup(next).then(() => setup.reload());
  const forTask = agents.data?.tasks.find((t) => t.task === 'diagnosticar');
  return (
    <section className="diag-setup">
      <fieldset>
        <legend>Quem escreve o relatório</legend>
        {WHO.map((o) => (
          <label key={o.id} className="radio-row">
            <input type="radio" name="who" checked={setup.data!.who === o.id} onChange={() => save({ who: o.id })} />
            <span><strong>{o.label}</strong><span className="muted block small">{o.hint}</span></span>
          </label>
        ))}
      </fieldset>
      {setup.data.who === 'agente' && (
        <p className="small muted">
          {forTask ? `Agente da tarefa diagnosticar: ${forTask.agent}${forTask.model ? ` · ${forTask.model}` : ''}.` : 'Escolha o agente da tarefa "diagnosticar" em Agentes de código.'}
          {' '}Também precisa do código do Orbi nesta máquina (<code>ORBI_SOURCE_DIR</code>). Sem uma das duas coisas, o modelo escreve.
        </p>
      )}
      <fieldset>
        <legend>Quando</legend>
        {WHEN.map((o) => (
          <label key={o.id} className="radio-row">
            <input type="radio" name="when" checked={setup.data!.when === o.id} onChange={() => save({ when: o.id })} />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="small muted">As regras rodam sempre, no fim de cada execução, e não gastam nada. "Analisar esta execução", na execução, escreve o relatório na hora, seja qual for a escolha acima.</p>
    </section>
  );
}
