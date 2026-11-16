'use agent';
import * as v from 'valibot';
import { defineTool, useModel, useTool } from './runtime-port.ts';
import { services, type OrbiServices } from '../services.ts';
import { modelForTurn, resolveRoles } from '../contexts/models/index.ts';
import { REPORT_PREFIX } from '../diagnosis/report.ts';
import instructions from '../prompts/diagnosticador.md?raw';

/**
 * O diagnosticador (conversa `diagnostico:<runId>`, docs/funcionalidades/24): lê o que as regras
 * acharam numa execução e o registro dela, e escreve o relatório que o desenvolvedor lê. Roda no
 * modelo mais barato e não tem ferramenta nenhuma além de entregar o texto: ele explica, não age.
 */
export function Diagnosticador({ id }: { id: string }) {
  const all = services();
  useModel(modelForTurn(all.llm, resolveRoles(all.llm, all.modelRoles.all(), all.modelTiers.all()), 'conhecimento'), { thinkingLevel: 'low' });
  useTool(writeReport(all, id.slice(REPORT_PREFIX.length)));
  return instructions;
}

Diagnosticador.agentName = 'diagnosticador';

/** O relatório, guardado na execução: é o que a tela mostra e o que o desenvolvedor copia. */
function writeReport(s: Pick<OrbiServices, 'diagnoses' | 'llm'>, runId: string) {
  return defineTool({
    name: 'write_report',
    description: 'Entrega o relatório desta execução, em markdown, no máximo 300 palavras.',
    input: v.object({ text: v.pipe(v.string(), v.minLength(20), v.maxLength(4000)) }),
    run({ data }) {
      const saved = s.diagnoses.saveReport(runId, { text: data.text.trim(), by: 'modelo', model: s.llm.model });
      return { output: { ok: true, at: saved.at } };
    },
  });
}
