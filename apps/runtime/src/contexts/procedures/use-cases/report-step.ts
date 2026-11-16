import type { PlaybookRun, StepStatus } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';
import { redact } from '../../secrets/index.ts';

/**
 * Dar o andamento de um passo da execução em curso: rodando, feito, falhou, esperando, pulado.
 * Com `outputs`, registra o que o procedimento entrega — e nenhum valor que seja credencial é
 * guardado como resultado.
 *
 * Duas recusas são regra de negócio, não erro: passo dado como feito cuja última ferramenta
 * falhou, e "esperando" sem nada de verdade esperando na conversa (documento 23).
 */

export interface Reported {
  run: PlaybookRun;
  /** Quando a execução acabou: o que ela aprendeu sozinha no passo 0, cada um com Desfazer. */
  learned: ReturnType<OrbiServices['procedures']['execution']['learnedIn']>;
  /** Quando a execução acabou dentro de uma esteira: o que a esteira faz a seguir. */
  next?: ReturnType<OrbiServices['procedures']['pipelineDefs']['notePassage']> | string | null;
}

export interface NotReported {
  refused: string;
  /** O que fazer em vez disso, para o modelo não insistir. */
  hint?: string;
}

type Deps = Pick<OrbiServices, 'procedures' | 'pipelines' | 'vault' | 'toolOutcomes' | 'inbox' | 'followups'>;

export async function reportStep(
  d: Deps,
  request: { runId: string; conversationId: string; stepId: string; status: StepStatus; note?: string; outputs?: Record<string, string> },
): Promise<Reported | NotReported> {
  const refusal = await whyNot(d, request);
  if (refusal) return refusal;

  let run: PlaybookRun;
  try {
    run = d.procedures.execution.updateRunStep(request.runId, request.stepId, request.status, request.note, await clean(d, request.outputs));
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
  if (run.status !== 'done' && run.status !== 'failed') return { run, learned: [] };

  // O nível e a revisão vêm quando o turno termina, depois de toda falha estar registrada.
  return { run, learned: d.procedures.execution.learnedIn(run), next: d.pipelines.engine.runFinished(run) };
}

/** As duas recusas que são regra, verificadas antes de mexer na execução. */
async function whyNot(d: Deps, r: { conversationId: string; stepId: string; status: StepStatus }): Promise<NotReported | null> {
  const last = d.toolOutcomes.lastIn(r.conversationId);
  if (r.status === 'done' && last?.failed) {
    return {
      refused: `o passo ${r.stepId} não pode ser dado como feito: a última ferramenta (${last.tool}) falhou${last.error ? ` (${last.error.slice(0, 200)})` : ''}.`,
      hint: 'Corrija e tente de novo, ou marque o passo como failed ou skipped com uma nota do que aconteceu.',
    };
  }
  if (r.status === 'waiting' && !(await somethingWaits(d, r.conversationId))) {
    return {
      refused: `nada está esperando nesta conversa: não há aprovação, pergunta nem retorno agendado para o passo ${r.stepId}.`,
      hint: 'Chame a ferramenta do passo (run_command, run_script…): se ela precisar de aprovação, o portão pede e o cartão aparece. Para esperar algo de fora, agende um retorno.',
    };
  }
  return null;
}

/** Um valor que por acaso seja credencial nunca é guardado como resultado. */
async function clean(d: Deps, outputs: Record<string, string> | undefined): Promise<Record<string, string> | undefined> {
  if (!outputs || !Object.keys(outputs).length) return outputs;
  const secrets = (await Promise.all(d.vault.list().map((x) => d.vault.get(x.name)))).filter((x): x is string => !!x);
  return Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, redact(v, secrets)]));
}

/**
 * Se a conversa espera algo: um cartão aberto (aprovação, pergunta, aprendizado, passagem) ou um
 * retorno agendado. Ferramentas do mesmo lote podem estar começando: olha de novo por um instante.
 */
async function somethingWaits(d: Deps, conversationId: string, tries = 4): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const open = d.inbox
      .list({ status: 'open' })
      .some((x) => x.conversationId === conversationId && x.kind !== 'level' && x.kind !== 'followup');
    if (open || d.followups.active(conversationId)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
