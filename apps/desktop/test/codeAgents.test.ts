import { describe, expect, it } from 'vitest';
import { agentState, modelOptions, notRegistered, parseModels, usedFor } from '../src/views/autonomy/codeAgents/model';
import type { CodeAgent, CodeAgentsState } from '../src/api';

const agent = (over: Partial<CodeAgent> = {}): CodeAgent => ({ id: 'claude-code', name: 'Claude Code', binary: 'claude', command: 'claude -p {prompt}', models: ['claude-haiku-5-5'], source: 'catalogo', runIn: 'background', lastTest: null, createdAt: '', updatedAt: '', ...over });

describe('agentes de código', () => {
  it('situação vem do último teste', () => {
    expect(agentState(agent()).label).toBe('não testado');
    expect(agentState(agent({ lastTest: { at: '', ok: true, detail: '' } })).tone).toBe('done');
    expect(agentState(agent({ lastTest: { at: '', ok: false, detail: 'x' } })).tone).toBe('failed');
    expect(agentState(agent({ source: 'env' })).label).toBe('do .env');
  });
  it('tarefas, catálogo e modelos', () => {
    const state: CodeAgentsState = {
      agents: [agent()],
      tasks: [{ task: 'investigar', agent: 'claude-code', model: null }, { task: 'corrigir', agent: 'claude-code', model: 'x' }],
      catalog: [{ id: 'claude-code', name: 'Claude Code', binary: 'claude', command: '', models: [] }, { id: 'devin', name: 'Devin', binary: 'devin', command: '', models: [] }],
    };
    expect(usedFor(state, 'claude-code')).toBe('investigar, corrigir');
    expect(notRegistered(state).map((c) => c.id)).toEqual(['devin']);
    expect(modelOptions(agent(), 'gpt-luna')).toEqual(['claude-haiku-5-5', 'gpt-luna']);
    expect(parseModels('a, b , ,a')).toEqual(['a', 'b']);
  });
});

describe('erro do chat', () => {
  it('sem chave do modelo, diz o que fazer', async () => {
    const { friendlyError } = await import('../src/components/chat/ChatPanel');
    expect(friendlyError('direct(sub_x) failed: Provider is not configured: anthropic')).toMatch(/ANTHROPIC_API_KEY/);
    expect(friendlyError('outro erro')).toBe('outro erro');
  });
});
