/**
 * How tool calls read in the conversation. Bookkeeping (checklist steps, brain lookups, the ui
 * channel) stays out: the checklist and cards already show it. A call waiting for approval is
 * the approval card. The rest reads by its purpose, with the command and its output on open.
 */
export interface ToolCall {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

const LABEL: Record<string, string> = {
  run_command: 'Comando', run_readonly_command: 'Comando (leitura)', run_python: 'Script Python', run_script: 'Script do procedimento', run_shell: 'Terminal', brain_query: 'Consulta ao cérebro',
  brain_learn: 'Aprender', browser_read: 'Navegador (leitura)', browser_act: 'Ação no navegador', playbook_start: 'Iniciar procedimento',
  playbook_step: 'Passo do procedimento', code_agent_investigate: 'Agente de código: investigar', code_agent_fix_known: 'Agente de código: corrigir problema conhecido', code_agent_push_fix: 'Agente de código: aplicar correção', code_agent_discard_fix: 'Agente de código: descartar correção',
  show_ui: 'Interface', ask_developer: 'Pergunta', schedule_followup: 'Agendar retorno', task: 'Subagente', playbook_similar: 'Procurar o que já sei',
  agent_reply: 'Resposta ao agente', ask_secret: 'Pedir credencial', pipeline_start: 'Começar esteira', pipeline_provide: 'Dados da etapa',
};

/** Shown by their own cards, or plain bookkeeping. */
const BOOKKEEPING = new Set([
  'show_ui', 'playbook_start', 'playbook_step', 'similar_found', 'ask_secret', 'brain_query', 'playbook_similar', 'activate_skill',
  'pipeline_start', 'pipeline_provide', 'ask_developer', 'agent_reply', 'rehearsal_start', 'rehearsal_step', 'rehearsal_finish',
]);

const outputOf = (t: ToolCall) => (t.output && typeof t.output === 'object' ? (t.output as Record<string, unknown>) : undefined);

export function isSilent(t: ToolCall): boolean {
  if (t.state === 'output-error') return false;
  if (BOOKKEEPING.has(t.toolName)) return true;
  return outputOf(t)?.status === 'pending_approval';
}

const inputOf = (t: ToolCall) => (t.input && typeof t.input === 'object' ? (t.input as Record<string, unknown>) : {});

/**
 * How a tool that went through the gate describes itself (title, command line): it comes with
 * the result, so a new tool reads well with no change here. The maps above are the fallback
 * for tools that do not say.
 */
const shownOf = (t: ToolCall) => {
  const out = outputOf(t);
  return out?.status === 'executed' ? { title: typeof out.title === 'string' ? out.title : undefined, command: typeof out.command === 'string' ? out.command : undefined } : {};
};

/** The row's text: the purpose the Orbi gave, the tool's own title, or what the tool is. */
export function toolLabel(t: ToolCall): string {
  const purpose = inputOf(t).purpose;
  if (typeof purpose === 'string' && purpose.trim()) return purpose.trim();
  return shownOf(t).title ?? LABEL[t.toolName] ?? t.toolName;
}

/** The command line, for tools that run one. */
export function toolCommand(t: ToolCall): string | undefined {
  const own = shownOf(t).command;
  if (own) return own;
  const i = inputOf(t);
  if (typeof i.binary === 'string') return [i.binary, ...((i.args as string[] | undefined) ?? [])].join(' ') + (typeof i.saveTo === 'string' ? ` > ${i.saveTo}` : '');
  if (t.toolName === 'run_shell' && typeof i.line === 'string') return i.line + (typeof i.saveTo === 'string' ? ` > ${i.saveTo}` : '');
  if (t.toolName === 'run_script' && typeof i.script === 'string') return [i.script, ...((i.args as string[] | undefined) ?? [])].join(' ') + (typeof i.saveTo === 'string' ? ` > ${i.saveTo}` : '');
  if (t.toolName === 'browser_act' || t.toolName === 'browser_read') return `navegador: ${String(i.tool ?? '')}`;
  return undefined;
}

/** What it printed, when it ran a command; else the result as text. */
/** The command's parsed result (run_command, run_script), when it is one. */
function commandResult(t: ToolCall): { exitCode?: number | null; timedOut?: boolean; knownProblems?: KnownProblemView[] } | undefined {
  const out = outputOf(t);
  const raw = out?.status === 'executed' ? out.result : t.output;
  if (typeof raw !== 'string') return undefined;
  try {
    const r = JSON.parse(raw) as Record<string, unknown>;
    return r && typeof r === 'object' && 'exitCode' in r ? (r as never) : undefined;
  } catch {
    return undefined;
  }
}

/** A command that ran but exited with an error: not "ok" for the developer. */
export const commandFailed = (t: ToolCall) => {
  const r = commandResult(t);
  return !!r && (r.timedOut === true || (r.exitCode !== 0 && r.exitCode !== undefined));
};

export interface KnownProblemView { id: string; sintoma: string; causa?: string; solucao: string; onde?: string; quemCorrige?: string; conferir?: string }
/** Known problems of the brain the runtime found for a failed command. */
export const knownProblemsOf = (t: ToolCall): KnownProblemView[] => commandResult(t)?.knownProblems ?? [];

export function toolResult(t: ToolCall): string | undefined {
  if (t.state === 'output-error') return t.errorText;
  const out = outputOf(t);
  if (!out && typeof t.output === 'string') return t.output;
  if (out?.status === 'not_executed') return String(out.reason ?? 'não executado');
  const raw = out?.status === 'executed' ? out.result : t.output;
  if (typeof raw === 'string') {
    try {
      const r = JSON.parse(raw) as { exitCode?: number; stdout?: string; stderr?: string; savedTo?: string | null; lines?: number; head?: string[] };
      if ('savedTo' in r) {
        return [r.savedTo ? `salvo em ${r.savedTo} (${r.lines ?? 0} linhas)` : 'não salvou (o comando falhou)', ...(r.head ?? []), r.stderr?.trim() && `stderr: ${r.stderr.trim()}`, `(saída ${r.exitCode})`].filter(Boolean).join('\n');
      }
      if ('exitCode' in r) return [r.stdout?.trim(), r.stderr?.trim() && `stderr: ${r.stderr.trim()}`, `(saída ${r.exitCode})`].filter(Boolean).join('\n');
    } catch { /* plain text */ }
    return raw;
  }
  return raw === undefined ? undefined : JSON.stringify(raw, null, 2);
}

const KIND: Record<string, [string, string]> = {
  run_command: ['comando', 'comandos'], run_readonly_command: ['comando', 'comandos'], run_python: ['script', 'scripts'], run_script: ['script', 'scripts'], run_shell: ['comando no terminal', 'comandos no terminal'],
  browser_read: ['leitura no navegador', 'leituras no navegador'], browser_act: ['ação no navegador', 'ações no navegador'],
  task: ['subagente', 'subagentes'],
};

/** "rodou 2 comandos · 1 ação no navegador" for a folded group. */
export function groupSummary(tools: ToolCall[]): string {
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t.toolName, (counts.get(t.toolName) ?? 0) + 1);
  const parts = [...counts].map(([name, n]) => {
    const [one, many] = KIND[name] ?? [LABEL[name]?.toLowerCase() ?? name, LABEL[name]?.toLowerCase() ?? name];
    return `${n} ${n === 1 ? one : many}`;
  });
  return parts.join(' · ');
}

/**
 * Whether an assistant message has anything to show yet: text, a card or a tool call that is not
 * bookkeeping. While a turn starts, the message exists with nothing in it (reasoning, silent tools).
 */
export function hasVisibleContent(parts: ReadonlyArray<{ type: string }>): boolean {
  return parts.some((p) => {
    if (p.type === 'text') return !!(p as { text?: string }).text?.trim();
    if (p.type === 'data-ui') return (((p as { data?: { components?: unknown[] } }).data?.components) ?? []).length > 0;
    if (p.type === 'dynamic-tool') return !isSilent(p as unknown as ToolCall);
    return false;
  });
}

/** Where the "working" indicator goes: after the last message, while the turn has nothing visible to show. */
export function workingState(messages: Array<{ role: string; parts: Array<{ type: string }> }>, running: boolean): 'none' | 'thinking' {
  if (!running) return 'none';
  // Runtime signals (system messages) are mostly not drawn: look at the last user or assistant message.
  const last = messages.filter((m) => m.role !== 'system').at(-1);
  if (!last || last.role === 'user') return 'thinking';
  if (last.role === 'assistant' && !hasVisibleContent(last.parts as never)) return 'thinking';
  return 'none';
}

/**
 * Where a conversation changes mode: from asking to teaching (a rehearsal starts) or back to doing
 * (a procedure starts). The chat marks the spot with a quiet line, so the stage bar appearing or
 * going away is not a surprise.
 */
export function modeMark(t: ToolCall): string | undefined {
  if (t.state === 'output-error') return undefined;
  const i = inputOf(t);
  if (t.toolName === 'rehearsal_start') return `A partir daqui: aprendendo com você${typeof i.goal === 'string' && i.goal.trim() ? ` · ${i.goal.trim()}` : ''}`;
  if (t.toolName === 'playbook_start' && typeof i.name === 'string') return `A partir daqui: fazendo ${i.name}`;
  if (t.toolName === 'pipeline_start' && typeof i.name === 'string') return `A partir daqui: esteira ${i.name}${typeof i.destination === 'string' ? `, até ${i.destination}` : ''}`;
  return undefined;
}
