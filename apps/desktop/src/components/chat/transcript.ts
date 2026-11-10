import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { findingsOf } from '../review';
import type { UiComponent } from '../UiComponents';
import { reviewOf } from '../ReviewCard';

/** Long tool inputs and outputs are cut so a copied conversation stays pasteable. */
const MAX_BLOCK = 4_000;

const clip = (text: string) => (text.length > MAX_BLOCK ? `${text.slice(0, MAX_BLOCK)}\n… (${text.length - MAX_BLOCK} caracteres cortados)` : text);
const json = (value: unknown) => clip(typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '');
const fence = (text: string, lang = '') => `\`\`\`${lang}\n${text}\n\`\`\``;

const STEP_MARK: Record<string, string> = { done: '[x]', running: '[~]', failed: '[!]', skipped: '[-]' };

/** A ui component as text: what the developer saw in the card. */
function component(c: UiComponent): string {
  switch (c.component) {
    case 'stepper':
      return [`**Checklist: ${c.title}** (${c.status})`, ...c.steps.map((s) => `- ${STEP_MARK[s.status] ?? '[ ]'} ${s.label}${s.note ? ` — ${s.note}` : ''}`)].join('\n');
    case 'status':
      return `**${c.title}** (${c.state}): ${c.text}`;
    case 'approval':
      return [`**Pedido de aprovação: ${c.title}**${c.step ? ` (${c.step})` : ''}`, c.command && `\`${c.command}\``, c.reason && `Por que pede: ${c.reason}`].filter(Boolean).join('\n');
    case 'level':
      return `**${c.playbook}: N${c.from} → N${c.to}** (${c.reason})${c.alone.length ? `\n- segue sozinho: ${c.alone.join(', ')}` : ''}${c.asks.length ? `\n- ainda pergunta: ${c.asks.join(', ')}` : ''}`;
    case 'question':
      return `**Pergunta:** ${c.question}${c.options.length ? `\nOpções: ${c.options.join(' · ')}` : ''}`;
    case 'table':
      return [`**${c.title}**`, `| ${c.columns.join(' | ')} |`, `| ${c.columns.map(() => '---').join(' | ')} |`, ...c.rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
    case 'link':
      return `[${c.title}](${c.url})`;
    case 'code':
      return `**${c.title}**\n${fence(clip(c.text), c.language)}`;
    case 'known':
      return `_Já sei fazer isso: \`${c.playbook.name}\` (${c.playbook.successes} de ${c.playbook.uses} deram certo)._`;
    case 'similar':
      return [
        c.known,
        `**Já sei algo parecido: \`${c.playbook.name}\`** (${c.relation}; ${c.playbook.successes} de ${c.playbook.uses} deram certo)`,
        ...c.reuse.map((r) => `- aproveita: ${r}`),
        ...c.changes.map((r) => `- muda: ${r}`),
        c.suggestion && `Sugestão: ${c.suggestion}`,
        `Opções: ${c.options.map((o) => o.label).join(' · ')}`,
      ].filter(Boolean).join('\n');
    case 'secret':
      return `**O Orbi pediu uma credencial:** \`{{segredo:${c.name}}}\` (${c.description || c.reason}). O valor vai direto ao cofre.`;
    case 'learning':
      return [`**Aprendizado proposto: ${c.title}**`, ...c.items.map((i) => `- ${i.kind}: ${i.summary}`)].join('\n');
    case 'code_change':
      return [`**${c.title}** (${c.alone ? 'seguiu sozinho' : 'aprovada'}) · ${c.repo} · ${c.branch} · commit ${c.commit}`, `- O quê: ${c.files.join(', ')}`, `- Por quê: ${c.why}`, `- Quem: ${c.agent}`].join('\n');
    case 'readiness':
      return [`**O que eu sei: ${c.title}**`, ...c.items.map((i) => `- ${i.known ? '[sei]' : '[não sei]'} ${i.label}: ${i.detail}`)].join('\n');
    case 'agreement':
      return [`**${c.question}**`, `- Começa: ${c.start}`, `- Recebe: ${c.receives.join(', ')}`, `- Termina: ${c.end}`,
        ...c.outside.map((x) => `- Fica de fora: ${x}`), ...c.corrections.map((x) => `- Corrigido: ${x.explained} → ${x.actual}`)].join('\n');
    case 'learned_facts':
      return [`**${c.title}**`, ...c.items.map((i) => `- "${i.value}" → \`${i.entity}\` (${i.learned === 'alias' ? 'outro nome' : 'fato novo'})${i.undone ? ' — desfeito' : ''}`)].join('\n');
  }
}

function part(p: FlueConversationPart): string | undefined {
  if (p.type === 'text') return p.text.trim() || undefined;
  if (p.type === 'dynamic-tool') {
    const state = p.state === 'output-error' ? 'erro' : p.state === 'input-available' ? 'executando' : 'ok';
    const lines = [`**Ferramenta \`${p.toolName}\`** (${state})`, fence(json(p.input), 'json')];
    if (p.state === 'output-available') lines.push('Resultado:', fence(json(p.output)));
    if (p.state === 'output-error') lines.push('Erro:', fence(clip(p.errorText ?? '')));
    return lines.join('\n');
  }
  if (p.type === 'data-ui') {
    const comps = (p.data as { components?: UiComponent[] })?.components ?? [];
    return comps.map(component).join('\n\n') || undefined;
  }
  return undefined;
}

function message(m: FlueConversationMessage): string | undefined {
  if (m.role === 'system') {
    if (m.settlement) return `_— a execução ${m.settlement.outcome === 'aborted' ? 'foi interrompida' : 'falhou'} —_`;
    if (m.signal?.tagName === 'followup' || m.signal?.attributes?.type === 'followup') return '_— retorno agendado —_';
    if (m.signal?.tagName === 'pipeline' || m.signal?.attributes?.type === 'pipeline') return `_— esteira: ${m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('').split('. ')[0]} —_`;
    if (m.signal?.tagName === 'secret-saved' || m.signal?.attributes?.type === 'secret-saved') return '_— credencial guardada no cofre —_';
    if (m.signal?.tagName === 'review' || m.signal?.attributes?.type === 'review') {
      const r = reviewOf(m.signal?.attributes as Record<string, unknown> | undefined);
      if (!r) return undefined;
      return [
        '**Revisão da execução**' + (r.pipeline ? ` (esteira ${r.pipeline})` : ''),
        ...r.runs.map((x) => { const bad = findingsOf(x, 'problema'); return `- ${x.playbook}: ${bad.length ? bad.join('; ') : 'sem problemas'}${x.level ? ` · N${x.level.from} → N${x.level.to}` : ''}`; }),
        ...r.config.map((c) => `- configuração (${c.stage}): ${c.text}`),
      ].join('\n');
    }
    if (m.signal?.tagName === 'agent-request' || m.signal?.attributes?.type === 'agent-request') {
      return `> ${m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('').split('\n').join('\n> ')}`;
    }
    return undefined;
  }
  const body = m.parts.map(part).filter(Boolean).join('\n\n');
  if (m.role === 'user') {
    if (body.startsWith('<demonstracao')) return `### Você (demonstração no navegador)\n\n${fence(clip(body), 'xml')}`;
    return `### Você\n\n${body}`;
  }
  return body ? `### Orbi\n\n${body}` : undefined;
}

/**
 * The whole conversation as Markdown, in order: what was said, each tool with
 * its input and result, cards, approvals and failures. For pasting into an
 * issue, a chat or a bug report.
 */
export function conversationMarkdown(
  info: { id: string; title: string },
  messages: FlueConversationMessage[],
  at = new Date(),
): string {
  const head = `# ${info.title || 'Conversa'}\n\nOrbi · conversa \`${info.id}\` · copiada em ${at.toLocaleString('pt-BR')}`;
  return [head, ...messages.filter((m) => m.display !== 'hidden').map(message).filter(Boolean)].join('\n\n---\n\n') + '\n';
}
