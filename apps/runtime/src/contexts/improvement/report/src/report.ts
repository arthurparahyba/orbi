/**
 * O relatório do diagnóstico (docs/funcionalidades/24): o que os detectores acharam, explicado
 * junto, para o desenvolvedor ler e para quem for corrigir o Orbi. Quem escreve é o modelo mais
 * barato (o agente `diagnosticador`) ou um agente de código instalado, que lê o código do Orbi e
 * confirma a causa. As regras continuam rodando sem custo: o relatório só explica o que elas viram.
 */
import type { PlaybookRun } from '../../../../language/index.ts';
import type { RunCall } from '../../../procedures/index.ts';
import type { Diagnosis } from '../../diagnosis/src/diagnoses.ts';

export const REPORT_PREFIX = 'diagnostico:';

export interface ReportSource {
  /** `modelo` ou o id do agente de código que escreveu. */
  by: string;
  /** O modelo usado, quando se sabe. */
  model?: string | null;
}

const SIZE = (chars: number) => (chars >= 1000 ? `${Math.round(chars / 1000)} mil` : String(chars));
const step = (run: Pick<PlaybookRun, 'steps'>, id: string | null) => {
  const at = run.steps.findIndex((s) => s.id === id);
  return at < 0 ? 'fora dos passos' : `${at + 1} · ${run.steps[at]!.label}`;
};

/**
 * O que o diagnosticador recebe: os achados das regras e o registro da execução. Fica na máquina
 * do desenvolvedor, então vai com os nomes de verdade — a troca por apelido é só para a issue.
 */
export function reportBrief(run: PlaybookRun, calls: readonly RunCall[], found: readonly Diagnosis[]): string {
  const marked = calls.filter((c) => c.status === 'erro' || c.marks.length > 0 || (c.approval && c.approval !== 'sozinha'));
  return [
    `Execução de ${run.playbook} (${run.status}), ${calls.length} chamadas, ${SIZE(calls.reduce((s, c) => s + c.chars, 0))} caracteres ao modelo.`,
    `Passos: ${run.steps.map((s, i) => `${i + 1} · ${s.label} (${s.status})`).join(' · ')}`,
    '',
    found.length ? 'O que as regras acharam (não é do procedimento do desenvolvedor):' : 'As regras não acharam nada; diga isso em uma linha e pare.',
    ...found.map((f) => `- [${f.category}${f.minor ? ', corrigido na hora' : ''}] ${f.title}: ${f.detail}${f.hint ? ` (onde olhar: ${f.hint})` : ''}${f.times > 1 ? ` · ${f.times}ª vez nesta máquina` : ''}`),
    '',
    'O registro desta execução, só o que chama atenção:',
    ...marked.map((c) => `- passo ${step(run, c.step)} · ${c.tool}${c.summary ? ` ${c.summary}` : ''} → ${c.status}${c.approval && c.approval !== 'sozinha' ? ` (${c.approval})` : ''} · ${SIZE(c.chars)} caracteres${c.marks.length ? ` [${c.marks.join(', ')}]` : ''}${c.error ? `\n  erro: ${c.error}` : ''}`),
    ...(run.deviations.length ? ['', 'Desvios registrados:', ...run.deviations.map((d) => `- ${d.kind}${d.recovered ? ' (recuperado)' : ''}${d.step ? ` no passo ${step(run, d.step)}` : ''}: ${d.detail}`)] : []),
  ].join('\n');
}

/** O pedido ao agente de código instalado, que tem o código do Orbi na mão. */
export const AGENT_PROMPT = (brief: string) =>
  [
    'Você está no código do Orbi, o aplicativo que gerou a execução abaixo. Só leia: não mude, não rode, não faça commit.',
    'Para cada achado, confirme no código se a causa é essa (diga arquivo e linha) ou descarte, dizendo por quê.',
    'Procure também o que as regras não viram, no registro da execução.',
    'Separe o que é defeito do Orbi do que é do procedimento do desenvolvedor e do que é chamada errada do modelo.',
    'Escreva no arquivo relatorio.md, em português do Brasil, no máximo 400 palavras, nesta ordem:',
    '1. uma linha com o que mais importa; 2. cada achado (confirmado ou hipótese) com arquivo e linha; 3. o que sugere mudar.',
    'Não repita o registro: explique.',
    '',
    brief,
  ].join('\n');
