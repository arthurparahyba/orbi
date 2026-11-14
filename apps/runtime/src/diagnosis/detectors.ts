/**
 * What went wrong in an execution that is **not** the procedure's fault (docs/funcionalidades/24).
 * The review of the procedure looks at the steps; these look at the Orbi itself and at the model,
 * so a defect of the application never comes back as a change to the developer's procedure.
 *
 * Each detector reads the registry of the execution (`run_calls`) and says, in the developer's
 * words, what happened and where. Pure rules: a new detector is a new entry here, with its test.
 */
import type { PlaybookRun } from '../brain/domain/types.ts';
import type { RunCall } from '../brain/domain/run-calls.ts';
import type { Playbook } from '../brain/domain/types.ts';

/** `orbi`: a defect of the application. `modelo`: the model called something wrongly; no code is to blame. */
export type DiagnosisCategory = 'orbi' | 'modelo';

export interface Detected {
  detector: string;
  category: DiagnosisCategory;
  /** One line, as the developer reads it. */
  title: string;
  /** What happened, with the numbers from the registry. */
  detail: string;
  /** Where to look, for whoever fixes it. */
  hint?: string;
  step?: string | null;
  /** The same defect in another execution has the same fingerprint: occurrences are counted. */
  fingerprint: string;
  /**
   * Worth writing down but not worth interrupting for: a slip the model fixed on the spot. It is
   * kept (many of the same mean a confusing instruction) and shows on the execution, but it does
   * not wake the conversation.
   */
  minor?: boolean;
}

export interface Seen {
  run: Pick<PlaybookRun, 'id' | 'playbook' | 'steps' | 'deviations'>;
  calls: readonly RunCall[];
  playbook?: Pick<Playbook, 'steps'>;
}

const short = (text: string, max = 160) => text.replace(/\s+/g, ' ').trim().slice(0, max);
const stepName = (run: Seen['run'], step: string | null | undefined) => {
  const at = run.steps.findIndex((s) => s.id === step);
  return at < 0 ? 'fora dos passos' : `${at + 1} · ${run.steps[at]!.label}`;
};
/** Tools a step's instruction can name; a step that names one and makes no call did not do its work. */
const NAMES_TOOL = /\b(run_command|run_shell|run_script|run_python|browser_act|browser_read|mcp__|evaluate_script|curl)/;

type Detector = (seen: Seen) => Detected[];

/** The answer that went into a file came cut: the file may be broken (documento 23 corrigiu a causa). */
const cutFile: Detector = ({ run, calls }) =>
  calls
    .filter((c) => c.marks.includes('cortado') && /saveTo=/.test(c.summary))
    .map((c) => ({
      detector: 'arquivo-cortado',
      category: 'orbi' as const,
      title: 'o arquivo gravado pode estar cortado',
      detail: `${c.tool} gravou um arquivo (${short(c.summary, 80)}) com a resposta cortada: ${c.chars} caracteres. O passo que lê esse arquivo pode falhar.`,
      hint: 'browser/mcp/chrome-devtools.ts e agents/tools/browser.ts: o corte é só para o modelo; o arquivo recebe a resposta inteira.',
      step: c.step,
      fingerprint: `arquivo-cortado:${c.tool}`,
    }));

/** Approved by the developer and then refused by the Orbi itself: the approval was for nothing. */
const refusedAfterApproval: Detector = ({ calls }) =>
  calls
    .filter((c) => c.marks.includes('recusado-depois'))
    .map((c) => ({
      detector: 'recusado-depois',
      category: 'orbi' as const,
      title: 'você aprovou e o Orbi recusou depois',
      detail: `${c.tool} (${short(c.summary, 80)}) foi aprovado por você e recusado ao rodar: ${short(c.error)}.`,
      hint: 'agents/tools/terminal.ts: o que a máquina não permite é recusado antes do cartão (precheck), não depois.',
      step: c.step,
      fingerprint: `recusado-depois:${c.tool}`,
    }));

/**
 * The model called a tool that does not exist, or with arguments that do not validate. One slip it
 * fixed on the spot is `minor`: written down (many of the same mean a confusing description) but
 * not worth interrupting the developer for.
 */
const wrongCalls: Detector = ({ run, calls }) => {
  const wrong = calls.filter((c) => c.marks.includes('chamada'));
  const by = new Map<string, RunCall[]>();
  for (const c of wrong) by.set(c.tool, [...(by.get(c.tool) ?? []), c]);
  return [...by].map(([tool, list]) => {
    const stuck = run.deviations.some((d) => d.kind === 'chamada' && d.tool === tool && !d.recovered);
    const minor = list.length === 1 && !stuck;
    return {
      detector: 'chamada-errada',
      category: 'modelo' as const,
      title: `o modelo chamou ${tool} errado`,
      detail: `${list.length === 1 ? 'uma vez' : `${list.length} vezes`}: ${short(list[0]!.error)}.${minor ? ' Corrigiu na hora, então não atrapalhou.' : ''} Não é falha do passo nem do procedimento; muitas iguais significam descrição ou instrução confusa.`,
      step: list[0]!.step,
      fingerprint: `chamada-errada:${tool}:${short(list[0]!.error, 40)}`,
      ...(minor ? { minor: true } : {}),
    };
  });
};

/** The model tried to close a step before the one before it (the runtime refuses it). */
const stepsOutOfOrder: Detector = ({ calls }) =>
  calls
    .filter((c) => c.tool === 'playbook_step' && c.status === 'erro' && /feche .* antes de/.test(c.error))
    .map((c) => ({
      detector: 'passo-fora-de-ordem',
      category: 'modelo' as const,
      title: 'o modelo tentou fechar um passo fora de ordem',
      detail: `${short(c.error)}. O runtime recusou, então nada foi contado no passo errado.`,
      step: c.step,
      fingerprint: 'passo-fora-de-ordem',
    }));

/** A step whose instruction names a tool was given as done without a single call of its own. */
const emptySteps: Detector = ({ run, calls, playbook }) => {
  if (calls.length === 0) return [];
  const work = new Set(calls.filter((c) => c.tool !== 'playbook_step' && c.tool !== 'playbook_start').map((c) => c.step));
  return run.steps
    .filter((s) => s.status === 'done' && !work.has(s.id))
    .filter((s) => NAMES_TOOL.test(playbook?.steps.find((x) => x.id === s.id)?.how ?? ''))
    .map((s) => ({
      detector: 'passo-sem-ferramenta',
      category: 'modelo' as const,
      title: `o passo ${stepName(run, s.id)} foi dado como feito sem nenhuma chamada`,
      detail: 'A instrução do passo diz qual ferramenta usar, e o registro desta execução não tem nenhuma chamada nele. Ou ele foi feito em outro passo, ou foi dado como feito sem ser feito.',
      step: s.id,
      fingerprint: `passo-sem-ferramenta:${run.playbook}:${s.id}`,
    }));
};

/** Every detector, in the order the findings are shown. */
export const DETECTORS: readonly Detector[] = [cutFile, refusedAfterApproval, wrongCalls, stepsOutOfOrder, emptySteps];

/** What the detectors found in this execution. */
export function detect(seen: Seen, detectors: readonly Detector[] = DETECTORS): Detected[] {
  return detectors.flatMap((d) => d(seen));
}

/** "2 problemas do Orbi e 1 do modelo" — how it reads on the list and in the conversation. */
export function countsLine(found: ReadonlyArray<{ category: DiagnosisCategory }>): string {
  const orbi = found.filter((f) => f.category === 'orbi').length;
  const model = found.filter((f) => f.category === 'modelo').length;
  const parts = [
    ...(orbi ? [`${orbi} ${orbi === 1 ? 'problema' : 'problemas'} do Orbi`] : []),
    ...(model ? [`${model} ${model === 1 ? 'problema' : 'problemas'} do modelo`] : []),
  ];
  return parts.join(' e ');
}
