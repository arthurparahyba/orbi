import { VERSION } from '../../../version.ts';
import type { OrbiServices } from '../../../services.ts';
import { draftIssue, type IssueDraft } from '../report/src/issue.ts';

/**
 * "Ver o que vai": o texto exato da issue de um diagnóstico, já sem nada do trabalho do
 * desenvolvedor — nomes, caminhos e segredos saem antes (documento 24). Atravessa dois contextos
 * (`improvement` guarda o diagnóstico, `procedures` a execução e as chamadas) e é pedido de fora
 * duas vezes: para ver e para enviar.
 */

/** O diagnóstico, ou a execução de que ele fala, não existe. */
export interface NoDiagnosis {
  refused: string;
}

type Deps = Pick<OrbiServices, 'diagnoses' | 'procedures'>;

export function issueDraft(d: Deps, id: string, platform: string): IssueDraft | NoDiagnosis {
  const diagnosis = d.diagnoses.get(id);
  const run = diagnosis && d.procedures.execution.run(diagnosis.runId);
  if (!diagnosis || !run) return { refused: 'diagnóstico' };

  return draftIssue(diagnosis, { run, calls: d.procedures.calls.list(run.id), version: VERSION, platform });
}
