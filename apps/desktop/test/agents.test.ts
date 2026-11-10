import { describe, expect, it } from 'vitest';
import { agentStats, connectCommand, requestState, timeAgo } from '../src/views/agents/connect';
import { secretNameProblem, toSecretName } from '../src/views/autonomy/format';
import type { AgentRequest, InboxItem } from '../src/api';

const req = (over: Partial<AgentRequest> = {}): AgentRequest => ({
  id: 'req_1', clientId: 'c', agent: 'Claude Code', conversationId: 'chat:1', task: 't', procedure: 'p', pipeline: null, context: {},
  status: 'running', summary: null, links: [], createdAt: new Date().toISOString(), finishedAt: null, ...over,
});
const approval = (conversationId: string): InboxItem => ({ id: 'i', kind: 'approval', conversationId, title: 'Rodar deploy', detail: '', createdAt: '', status: 'open' });

describe('agentes', () => {
  it('monta o comando do Claude Code e o JSON dos outros com o token', () => {
    expect(connectCommand('claude-code', 'http://127.0.0.1:3000/mcp', 'orb_x').text)
      .toBe('claude mcp add --scope user --transport http orbi http://127.0.0.1:3000/mcp --header "Authorization: Bearer orb_x"');
    expect(JSON.parse(connectCommand('cursor', 'http://u', 'orb_y').text)).toEqual({ mcpServers: { orbi: { url: 'http://u', headers: { Authorization: 'Bearer orb_y' } } } });
  });
  it('pedido rodando vira "esperando" quando a conversa dele tem pendência', () => {
    expect(requestState(req(), [approval('chat:1')])).toBe('waiting');
    expect(requestState(req(), [approval('chat:2')])).toBe('running');
    expect(requestState(req({ status: 'done' }), [approval('chat:1')])).toBe('done');
  });
  it('conta rodando, esperando e de hoje', () => {
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(agentStats([req(), req({ id: '2', conversationId: 'chat:2', createdAt: old }), req({ id: '3', status: 'done' })], [approval('chat:2')]))
      .toEqual({ running: 1, waiting: 1, today: 2 });
  });
  it('tempo relativo curto', () => {
    const now = Date.parse('2026-11-07T12:00:00Z');
    expect(timeAgo('2026-11-07T11:59:50Z', now)).toBe('agora');
    expect(timeAgo('2026-11-07T11:50:00Z', now)).toBe('há 10 min');
    expect(timeAgo(null, now)).toBe('nunca');
  });
});

describe('cofre: nome da credencial', () => {
  it('normaliza enquanto digita', () => {
    expect(toSecretName('GitHub Senha')).toBe('github-senha');
    expect(toSecretName('Portal/Usuário!')).toBe('portal/usuario');
  });
  it('acusa começo inválido e nome repetido', () => {
    expect(secretNameProblem('-x', [])).toMatch(/Comece/);
    expect(secretNameProblem('github/senha', ['github/senha'])).toMatch(/Já existe/);
    expect(secretNameProblem('github/senha', [])).toBeUndefined();
  });
});

import { appendDictation } from '../src/components/dictation';
describe('ditado', () => {
  it('junta o texto ditado ao que já está na caixa', () => {
    expect(appendDictation('', '  olá ')).toBe('olá');
    expect(appendDictation('Atualiza', 'a versão')).toBe('Atualiza a versão');
    expect(appendDictation('Atualiza ', 'a versão')).toBe('Atualiza a versão');
    expect(appendDictation('Atualiza', '   ')).toBe('Atualiza');
  });
});

import { micAvailability } from '../src/components/dictation';

describe('microfone e o modelo de voz', () => {
  const local = (status: { state: string; progress?: number }) => ({ backend: 'local', status });
  it('espera o modelo carregar e diz o porquê', () => {
    expect(micAvailability(local({ state: 'loading' }))).toEqual({ ready: false, why: 'Carregando o modelo de voz… (só depois de abrir o Orbi)' });
    expect(micAvailability(local({ state: 'downloading', progress: 41.6 })).why).toBe('Baixando o modelo de voz 42%…');
  });
  it('fica livre quando pronto, parado (carrega no primeiro uso), com erro ou sem modelo local', () => {
    for (const state of ['ready', 'idle', 'error']) expect(micAvailability(local({ state })).ready).toBe(true);
    expect(micAvailability({ backend: 'http', status: { state: 'loading' } }).ready).toBe(true);
    expect(micAvailability(undefined).ready).toBe(true);
  });
});
