import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { ClockIcon, KeyIcon, ToolIcon } from '../../components/Icons';
import { UiComponentView, type UiComponent } from '../../components/UiComponents';
import { Markdown } from '../../components/Markdown';
import { DemonstrationCard } from '../../components/Demonstration';
import { commandFailed, groupSummary, isSilent, knownProblemsOf, toolCommand, toolLabel, toolResult } from './tools';
import { KnownProblems } from '../../components/KnownProblems';
import { ReviewCard, reviewOf } from '../../components/ReviewCard';

/** One message of the conversation, as the developer should see it. */
export function Message({ m }: { m: FlueConversationMessage }) {
  if (m.role === 'system') {
    // Runtime plumbing (MCP availability, skill/instruction updates, approval echoes) stays out of the chat:
    // approval cards already show their outcome. Only failed turns and scheduled check-ins surface.
    if (m.settlement) return <div className="msg system err">A execução {m.settlement.outcome === 'aborted' ? 'foi interrompida' : 'falhou'}.</div>;
    if (m.signal?.tagName === 'followup' || m.signal?.attributes?.type === 'followup') {
      return <div className="msg system"><ClockIcon size={12} /> Retorno agendado</div>;
    }
    if (m.signal?.tagName === 'pipeline' || m.signal?.attributes?.type === 'pipeline') {
      const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
      return <div className="msg system pipeline-signal">⚑ {text.split('. ')[0]}.</div>;
    }
    if (m.signal?.tagName === 'review' || m.signal?.attributes?.type === 'review') {
      const r = reviewOf(m.signal?.attributes as Record<string, unknown> | undefined);
      return r ? <div className="msg system review"><ReviewCard r={r} /></div> : null;
    }
    if (m.signal?.tagName === 'secret-saved' || m.signal?.attributes?.type === 'secret-saved') {
      return <div className="msg system"><KeyIcon size={12} /> Credencial guardada no cofre</div>;
    }
    if (m.signal?.tagName === 'agent-request' || m.signal?.attributes?.type === 'agent-request') {
      const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
      return <div className="msg system agent-request"><div className="card">{text}</div></div>;
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

/** Consecutive tool calls fold into one row so the checklist, cards and text stay readable. */
export function groupParts(parts: FlueConversationPart[]): Array<FlueConversationPart | ToolPart[]> {
  const out: Array<FlueConversationPart | ToolPart[]> = [];
  for (const p of parts) {
    if (p.type === 'dynamic-tool') {
      if (isSilent(p)) continue;
      const last = out[out.length - 1];
      if (Array.isArray(last)) last.push(p);
      else out.push([p]);
    } else out.push(p);
  }
  return out;
}

function ToolGroup({ tools }: { tools: ToolPart[] }) {
  if (tools.length === 1) return <ToolRow t={tools[0]} />;
  const running = tools.some((t) => t.state === 'input-available');
  const failed = tools.filter((t) => t.state === 'output-error').length;
  return (
    <details className={`tool group ${running ? 'is-input-available' : failed ? 'is-output-error' : ''}`}>
      <summary>
        <ToolIcon size={13} />
        <span>{groupSummary(tools)}</span>
        <span className="tool-state">{running ? 'executando' : failed ? `${failed} com erro` : 'ok'}</span>
      </summary>
      <div className="tool-list">{tools.map((t, i) => <ToolRow key={i} t={t} />)}</div>
    </details>
  );
}

/** One call: its purpose; on open, the command and what it printed (the arguments only for other tools). */
function ToolRow({ t }: { t: ToolPart }) {
  const command = toolCommand(t);
  const result = toolResult(t);
  const failed = t.state === 'output-error' || commandFailed(t);
  return (
    <>
      <details className={`tool is-${failed ? 'output-error' : t.state}`}>
        <summary>
          <ToolIcon size={13} />
          <span>{toolLabel(t)}</span>
          <span className="tool-state">{t.state === 'input-available' ? 'executando' : t.state === 'output-error' ? 'erro' : failed ? 'falhou' : 'ok'}</span>
        </summary>
        {command ? <pre className="code small">$ {command}</pre> : <pre className="code small">{JSON.stringify(t.input, null, 2)}</pre>}
        {result && <pre className={`code small ${failed ? 'err' : ''}`}>{result.length > 4000 ? `${result.slice(0, 4000)}\n…` : result}</pre>}
      </details>
      <KnownProblems problems={knownProblemsOf(t)} />
    </>
  );
}

function Part({ p }: { p: FlueConversationPart }) {
  if (p.type === 'text') return p.text.trim() ? <Markdown text={p.text} /> : null;
  if (p.type === 'reasoning') return null;
  if (p.type === 'dynamic-tool') return <ToolRow t={p} />;
  if (p.type === 'data-ui') {
    const comps = ((p.data as { components?: UiComponent[] })?.components ?? []);
    return <div className="ui-stack">{comps.map((c) => <UiComponentView key={c.id} c={c} />)}</div>;
  }
  return null;
}
