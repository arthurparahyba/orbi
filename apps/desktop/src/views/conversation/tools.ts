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
  run_command: 'Comando', run_readonly_command: 'Comando (leitura)', run_python: 'Script Python', brain_query: 'Consulta ao cérebro',
  brain_learn: 'Aprender', browser_read: 'Navegador (leitura)', browser_act: 'Ação no navegador', playbook_start: 'Iniciar procedimento',
  playbook_step: 'Passo do procedimento', claude_code_prepare_fix: 'Claude Code: preparar correção', claude_code_push_fix: 'Claude Code: enviar correção',
  show_ui: 'Interface', ask_developer: 'Pergunta', schedule_followup: 'Agendar retorno', task: 'Subagente', playbook_similar: 'Procurar o que já sei',
  agent_reply: 'Resposta ao agente', ask_secret: 'Pedir credencial', pipeline_start: 'Começar esteira', pipeline_provide: 'Dados da etapa',
};

/** Shown by their own cards, or plain bookkeeping. */
const BOOKKEEPING = new Set([
  'show_ui', 'playbook_start', 'playbook_step', 'similar_found', 'ask_secret', 'brain_query', 'playbook_similar', 'activate_skill',
  'pipeline_start', 'pipeline_provide', 'ask_developer', 'agent_reply',
]);

const outputOf = (t: ToolCall) => (t.output && typeof t.output === 'object' ? (t.output as Record<string, unknown>) : undefined);

export function isSilent(t: ToolCall): boolean {
  if (t.state === 'output-error') return false;
  if (BOOKKEEPING.has(t.toolName)) return true;
  return outputOf(t)?.status === 'pending_approval';
}

const inputOf = (t: ToolCall) => (t.input && typeof t.input === 'object' ? (t.input as Record<string, unknown>) : {});

/** The row's text: the purpose the Orbi gave, or what the tool is. */
export function toolLabel(t: ToolCall): string {
  const purpose = inputOf(t).purpose;
  if (typeof purpose === 'string' && purpose.trim()) return purpose.trim();
  return LABEL[t.toolName] ?? t.toolName;
}

/** The command line, for tools that run one. */
export function toolCommand(t: ToolCall): string | undefined {
  const i = inputOf(t);
  if (typeof i.binary === 'string') return [i.binary, ...((i.args as string[] | undefined) ?? [])].join(' ') + (typeof i.saveTo === 'string' ? ` > ${i.saveTo}` : '');
  if (t.toolName === 'browser_act' || t.toolName === 'browser_read') return `navegador: ${String(i.tool ?? '')}`;
  return undefined;
}

/** What it printed, when it ran a command; else the result as text. */
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
  run_command: ['comando', 'comandos'], run_readonly_command: ['comando', 'comandos'], run_python: ['script', 'scripts'],
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
