import { describe, expect, it } from 'vitest';
import type { FlueConversationPart } from '@flue/react';
import { groupParts } from '../src/views/conversation/Message';

const tool = (toolName: string, state = 'output-available') => ({ type: 'dynamic-tool', toolName, state, input: {} }) as unknown as FlueConversationPart;
const text = (t: string) => ({ type: 'text', text: t }) as FlueConversationPart;

describe('groupParts', () => {
  it('junta ferramentas seguidas e esconde as internas (checklist, cérebro, interface)', () => {
    const parts = [text('oi'), tool('run_command'), tool('show_ui'), tool('brain_query'), tool('browser_read'), text('pronto'), tool('run_command')];
    const groups = groupParts(parts);
    expect(groups).toHaveLength(4);
    expect(Array.isArray(groups[1]) && groups[1].map((t) => t.toolName)).toEqual(['run_command', 'browser_read']);
    expect(Array.isArray(groups[3]) && groups[3]).toHaveLength(1);
  });

  it('mostra uma ferramenta silenciosa quando ela falha', () => {
    const groups = groupParts([tool('show_ui', 'output-error')]);
    expect(groups).toHaveLength(1);
  });
});

describe('ferramentas legíveis', async () => {
  const { isSilent, toolLabel, toolCommand, toolResult, groupSummary } = await import('../src/views/conversation/tools');
  const call = (toolName: string, input: unknown, output?: unknown, state = 'output-available') => ({ toolName, state, input, output });

  it('pedido de aprovação some: o cartão mostra', () => {
    expect(isSilent(call('run_command', {}, { status: 'pending_approval', approvalId: 'x' }))).toBe(true);
    expect(isSilent(call('run_command', {}, { status: 'executed', result: '' }))).toBe(false);
  });

  it('lê pelo propósito, com o comando e a saída em vez do JSON', () => {
    const c = call('run_command', { binary: 'gh', args: ['api', 'repos/a/b/pages'], purpose: 'Obter a URL do Pages' },
      { status: 'executed', result: JSON.stringify({ exitCode: 0, stdout: 'https://a.github.io/b/\n', stderr: '' }) });
    expect(toolLabel(c)).toBe('Obter a URL do Pages');
    expect(toolCommand(c)).toBe('gh api repos/a/b/pages');
    expect(toolResult(c)).toBe('https://a.github.io/b/\n(saída 0)');
  });

  it('resume um grupo em palavras', () => {
    expect(groupSummary([call('run_command', {}), call('run_command', {}), call('browser_act', {})])).toBe('2 comandos · 1 ação no navegador');
  });
});

describe('pendências', async () => {
  const { groupInbox, keepLabel, needsYou, since } = await import('../src/views/conversation/inbox');
  const item = (kind: string, extra: Record<string, string> = {}) => ({ id: kind, kind, conversationId: 'c', title: kind, detail: '', createdAt: '', status: 'open', ...extra }) as never;

  it('agrupa o que falta aprovar, as perguntas e os avisos', () => {
    const g = groupInbox([item('question'), item('level'), item('approval'), item('pipeline'), item('secret')]);
    expect(g.map((x) => [x.title, x.items.length])).toEqual([['Falta você aprovar', 2], ['Perguntas', 2], ['Para você saber', 1]]);
  });

  it('aviso não conta como esperando você e sabe o que manter', () => {
    expect(needsYou(item('level'))).toBe(false);
    expect(keepLabel(item('level', { routine: 'playbook:publicar', approvalId: '1' }))).toBe('Manter em N1');
    expect(keepLabel(item('level', { routine: 'passage:site/publicar', approvalId: 'ask' }))).toBe('Manter perguntando');
    expect(since(new Date(Date.now() - 2 * 60_000).toISOString())).toBe('há 2 min');
  });
});

describe('revisão e saída em arquivo', async () => {
  const { reviewOf } = await import('../src/components/ReviewCard');
  const { toolResult, toolCommand } = await import('../src/views/conversation/tools');
  it('lê a revisão do sinal', () => {
    const r = { runs: [{ runId: 'r', playbook: 'p', status: 'done', problems: ['x'] }], config: [] };
    expect(reviewOf({ review: JSON.stringify(r) })?.runs[0].findings).toEqual([{ kind: 'problema', text: 'x', analyzer: 'antigo' }]);
    expect(reviewOf({ review: '{' })).toBeUndefined();
    expect(reviewOf(undefined)).toBeUndefined();
  });
  it('comando com saveTo mostra onde salvou', () => {
    const c = { toolName: 'run_command', state: 'output-available', input: { binary: 'gh', args: ['api', 'x'], saveTo: '~/p/top.tsv' },
      output: { status: 'executed', result: JSON.stringify({ exitCode: 0, savedTo: '/u/p/top.tsv', lines: 100, head: ['a\tb'], stderr: '' }) } };
    expect(toolCommand(c)).toBe('gh api x > ~/p/top.tsv');
    expect(toolResult(c)).toBe('salvo em /u/p/top.tsv (100 linhas)\na\tb\n(saída 0)');
  });
});

import { scriptDiff } from '../src/components/stepDiff';
describe('scripts do procedimento no cartão', () => {
  const a = { name: 'a.py', code: 'print(1)' };
  it('marca novo, muda e sai contra a base; sem o campo, ficam os da base', () => {
    const d = scriptDiff([a, { name: 'b.py', code: 'x' }], [{ ...a, code: 'print(2)' }, { name: 'c.py', code: 'y' }], true);
    expect(d.map((x) => `${x.script.name}:${x.change}`)).toEqual(['a.py:changed', 'c.py:new', 'b.py:removed']);
    expect(scriptDiff([a], undefined, true).map((x) => x.change)).toEqual(['same']);
  });
});

describe('comando que falhou', () => {
  it('saída diferente de zero conta como falha, e o problema conhecido vem junto', async () => {
    const { commandFailed, knownProblemsOf } = await import('../src/views/conversation/tools');
    const call = (result: object) => ({ type: 'dynamic-tool', toolName: 'run_command', toolCallId: 'x', state: 'output-available', input: {}, output: { status: 'executed', category: 'comandos-escrita', result: JSON.stringify(result) } }) as never;
    const known = [{ id: 'sonar', sintoma: 'Quality Gate failed', solucao: 'testes' }];
    expect(commandFailed(call({ exitCode: 1, stdout: '', stderr: 'Quality Gate failed', knownProblems: known }))).toBe(true);
    expect(knownProblemsOf(call({ exitCode: 1, stdout: '', stderr: 'x', knownProblems: known }))).toEqual(known);
    expect(commandFailed(call({ exitCode: 0, stdout: 'ok', stderr: '' }))).toBe(false);
    expect(knownProblemsOf(call({ exitCode: 0, stdout: 'ok', stderr: '' }))).toEqual([]);
  });
});
