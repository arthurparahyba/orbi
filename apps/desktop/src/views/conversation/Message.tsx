import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { ClockIcon, ToolIcon } from '../../components/Icons';
import { UiComponentView, type UiComponent } from '../../components/UiComponents';
import { Markdown } from '../../components/Markdown';
import { DemonstrationCard } from '../../components/Demonstration';

const TOOL_LABEL: Record<string, string> = {
  run_command: 'Comando', run_read_only_command: 'Comando (leitura)', run_python: 'Python', brain_query: 'Consulta ao cérebro',
  brain_learn: 'Aprender', browser_read: 'Navegador (leitura)', browser_act: 'Ação no navegador', playbook_start: 'Iniciar playbook',
  playbook_step: 'Passo do playbook', claude_code_prepare_fix: 'Claude Code: preparar correção', claude_code_push_fix: 'Claude Code: enviar correção',
  show_ui: 'Interface', ask_developer: 'Pergunta', schedule_followup: 'Agendar retorno', task: 'Subagente', playbook_similar: 'Procurar o que já sei',
};

/** One message of the conversation, as the developer should see it. */
export function Message({ m }: { m: FlueConversationMessage }) {
  if (m.role === 'system') {
    // Runtime plumbing (MCP availability, skill/instruction updates, approval echoes) stays out of the chat:
    // approval cards already show their outcome. Only failed turns and scheduled check-ins surface.
    if (m.settlement) return <div className="msg system err">A execução {m.settlement.outcome === 'aborted' ? 'foi interrompida' : 'falhou'}.</div>;
    if (m.signal?.tagName === 'followup' || m.signal?.attributes?.type === 'followup') {
      return <div className="msg system"><ClockIcon size={12} /> Retorno agendado</div>;
    }
    return null;
  }
  if (m.role === 'user') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    if (text.startsWith('<demonstracao')) return <DemonstrationCard text={text} />;
    return <div className="msg user"><div className="bubble">{text}</div></div>;
  }
  return (
    <div className="msg assistant">
      <div className="avatar" aria-hidden="true">O</div>
      <div className="parts">{groupParts(m.parts).map((g, i) => (Array.isArray(g) ? <ToolGroup key={i} tools={g} /> : <Part key={i} p={g} />))}</div>
    </div>
  );
}

type ToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;
/** Tools whose result is already drawn as a ui component (stepper, cards). */
const SILENT_TOOLS = new Set(['show_ui', 'playbook_start', 'playbook_step', 'similar_found']);

/** Consecutive tool calls fold into one "atividade" row so the stepper and text stay readable. */
export function groupParts(parts: FlueConversationPart[]): Array<FlueConversationPart | ToolPart[]> {
  const out: Array<FlueConversationPart | ToolPart[]> = [];
  for (const p of parts) {
    if (p.type === 'dynamic-tool') {
      if (SILENT_TOOLS.has(p.toolName) && p.state !== 'output-error') continue;
      const last = out[out.length - 1];
      if (Array.isArray(last)) last.push(p);
      else out.push([p]);
    } else out.push(p);
  }
  return out;
}

function ToolGroup({ tools }: { tools: ToolPart[] }) {
  if (tools.length === 1) return <Part p={tools[0]} />;
  const running = tools.some((t) => t.state === 'input-available');
  const failed = tools.filter((t) => t.state === 'output-error').length;
  return (
    <details className={`tool group ${running ? 'is-input-available' : failed ? 'is-output-error' : ''}`}>
      <summary>
        <ToolIcon size={13} />
        <span>{tools.length} ações: {[...new Set(tools.map((t) => TOOL_LABEL[t.toolName] ?? t.toolName))].join(', ')}</span>
        <span className="tool-state">{running ? 'executando' : failed ? `${failed} com erro` : 'ok'}</span>
      </summary>
      <div className="tool-list">{tools.map((t, i) => <Part key={i} p={t} />)}</div>
    </details>
  );
}

function Part({ p }: { p: FlueConversationPart }) {
  if (p.type === 'text') return p.text.trim() ? <Markdown text={p.text} /> : null;
  if (p.type === 'reasoning') return null;
  if (p.type === 'dynamic-tool') {
    return (
      <details className={`tool is-${p.state}`}>
        <summary>
          <ToolIcon size={13} />
          <span>{TOOL_LABEL[p.toolName] ?? p.toolName}</span>
          <span className="tool-state">{p.state === 'input-available' ? 'executando' : p.state === 'output-error' ? 'erro' : 'ok'}</span>
        </summary>
        <pre className="code small">{JSON.stringify(p.input, null, 2)}</pre>
        {p.state === 'output-available' && <pre className="code small">{typeof p.output === 'string' ? p.output : JSON.stringify(p.output, null, 2)}</pre>}
        {p.state === 'output-error' && <pre className="code small err">{p.errorText}</pre>}
      </details>
    );
  }
  if (p.type === 'data-ui') {
    const comps = ((p.data as { components?: UiComponent[] })?.components ?? []);
    return <div className="ui-stack">{comps.map((c) => <UiComponentView key={c.id} c={c} />)}</div>;
  }
  return null;
}
