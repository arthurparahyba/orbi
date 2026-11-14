/**
 * The registry of what an execution actually did (docs/funcionalidades/24): one entry per tool
 * call, with the step it counted in, what it cost in characters sent back to the model, whether it
 * waited for approval and how it ended. It is what the detail screen shows, what "Copiar execução
 * completa" hands over, and what the diagnosis reads. Pure rules.
 *
 * It never holds what a call returned: only its size, and a short summary of the arguments the
 * model itself wrote (a credential only ever appears there as `{{segredo:nome}}`).
 */

/** How a call ended. */
export type CallStatus = 'ok' | 'erro' | 'pediu' | 'negado' | 'observado' | 'recusado';
/** What the gate did with it: nothing (a plain read), ran alone, or went through a card. */
export type CallApproval = 'sozinha' | 'pedida' | 'aprovada' | 'negada';

/**
 * A mark is what makes a call worth looking at:
 * `caro` what came back to the model is big, `cortado` the answer did not fit,
 * `chamada` the model called the tool wrongly, `recusado-depois` approved and then refused.
 */
export type CallMark = 'caro' | 'cortado' | 'chamada' | 'recusado-depois';

export interface RunCall {
  /** The tool call's own id, which is also the approval's. */
  id: string;
  runId: string | null;
  conversationId: string;
  /** The step it counted in; null = outside any step. */
  step: string | null;
  tool: string;
  /** One readable line of the arguments, short. Never the whole payload. */
  summary: string;
  status: CallStatus;
  approval: CallApproval | null;
  /** First line of the error, when it failed. */
  error: string;
  durationMs: number;
  /** Characters that went back to the model: what the call cost to read. */
  chars: number;
  marks: CallMark[];
  at: string;
}

/** Past this, a single answer is a big part of a turn's reading: the call is marked `caro`. */
export const EXPENSIVE_CHARS = 20_000;
/** An execution with this much read in marked calls is worth telling the developer about. */
export const EXPENSIVE_RUN_CHARS = 60_000;

/** A tool cut its answer to fit (terminal, browser, MCP all say so in the text). */
const CUT = /…\[truncado\]|…\[\d+ caracteres omitidos\]…/;

/** What makes this call worth looking at. */
export function marksOf(call: Pick<RunCall, 'chars' | 'status' | 'error'>, text: string, isCallError: (e: string | undefined) => boolean): CallMark[] {
  const marks: CallMark[] = [];
  if (call.chars >= EXPENSIVE_CHARS) marks.push('caro');
  if (CUT.test(text)) marks.push('cortado');
  if (call.status === 'erro' && isCallError(call.error)) marks.push('chamada');
  return marks;
}

/** Arguments as one readable line: the values that say what the call does, nothing long. */
export function callSummary(args: unknown, max = 160): string {
  if (!args || typeof args !== 'object') return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    const text = Array.isArray(value) ? value.map(String).join(' ') : typeof value === 'object' ? '{…}' : String(value);
    if (!text || text === '{…}') continue;
    parts.push(text.length > 60 ? `${key}=${text.slice(0, 60).replace(/\s+/g, ' ')}…` : /^(tool|binary|name|id|command|url)$/.test(key) ? text : `${key}=${text.replace(/\s+/g, ' ')}`);
  }
  const line = parts.join(' · ');
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

const SIZE = (chars: number) => (chars >= 1000 ? `${Math.round(chars / 1000)} mil caracteres` : `${chars} caracteres`);
const STATUS: Record<CallStatus, string> = { ok: 'ok', erro: 'erro', pediu: 'esperou aprovação', negado: 'negado por você', observado: 'só observado', recusado: 'recusado antes de pedir' };
const MARK: Record<CallMark, string> = { caro: 'leitura cara', cortado: 'resposta cortada', chamada: 'chamada errada', 'recusado-depois': 'aprovado e recusado depois' };

/** How many characters the marked (expensive) calls of a run read. */
export const expensiveChars = (calls: readonly RunCall[]): number => calls.filter((c) => c.marks.includes('caro')).reduce((sum, c) => sum + c.chars, 0);

/**
 * The whole execution as plain text, grouped by step: what "Copiar execução completa" gives to
 * whoever is going to debug it. Nothing is cut here but each call's own summary.
 */
export function transcript(
  run: { id: string; playbook: string; status: string; startedAt: string; finishedAt: string | null; params: Record<string, string>; outputs: Record<string, string>; steps: ReadonlyArray<{ id: string; label: string; status: string; note?: string }> },
  calls: readonly RunCall[],
  deviations: ReadonlyArray<{ kind: string; detail: string; step?: string | null; recovered?: boolean }> = [],
): string {
  const lines: string[] = [
    `# ${run.playbook} · ${run.status}`,
    `execução ${run.id} · início ${run.startedAt}${run.finishedAt ? ` · fim ${run.finishedAt}` : ''}`,
    ...(Object.keys(run.params).length ? [`recebeu: ${Object.entries(run.params).map(([k, v]) => `${k}=${v}`).join(' · ')}`] : []),
    ...(Object.keys(run.outputs).length ? [`entregou: ${Object.entries(run.outputs).map(([k, v]) => `${k}=${v}`).join(' · ')}`] : []),
    `${calls.length} chamadas · ${SIZE(calls.reduce((s, c) => s + c.chars, 0))} ao modelo · ${calls.filter((c) => c.approval && c.approval !== 'sozinha').length} aprovações`,
  ];
  const groups: Array<{ step: string | null; label: string }> = [
    ...run.steps.map((s, i) => ({ step: s.id as string | null, label: `${i + 1} · ${s.label} (${s.status})${s.note ? ` — ${s.note}` : ''}` })),
    { step: null, label: 'Fora dos passos' },
  ];
  for (const g of groups) {
    const mine = calls.filter((c) => (g.step ? c.step === g.step : !c.step || !run.steps.some((s) => s.id === c.step)));
    const theirs = deviations.filter((d) => (g.step ? d.step === g.step : !d.step));
    if (mine.length === 0 && theirs.length === 0) continue;
    lines.push('', `## ${g.label}`);
    for (const c of mine) {
      const marks = c.marks.length ? ` [${c.marks.map((m) => MARK[m]).join(', ')}]` : '';
      const approval = c.approval && c.approval !== 'sozinha' ? ` · ${c.approval}` : '';
      lines.push(`- ${c.at.slice(11, 19)} ${c.tool}${c.summary ? ` ${c.summary}` : ''} → ${STATUS[c.status]}${approval} · ${c.durationMs} ms · ${SIZE(c.chars)}${marks}`);
      if (c.error) lines.push(`    erro: ${c.error}`);
    }
    for (const d of theirs) lines.push(`- desvio (${d.kind}${d.recovered ? ', recuperado' : ''}): ${d.detail}`);
  }
  return `${lines.join('\n')}\n`;
}
