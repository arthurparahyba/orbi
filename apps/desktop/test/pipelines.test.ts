import { describe, expect, it } from 'vitest';
import { collectedData, draftProblems, inScope, paramsOf, runState, sourcesFor, stageIdFrom, waitingLine } from '../src/views/pipelines/model';
import type { PipelineRun, Playbook } from '../src/api';

const stage = (id: string, status: PipelineRun['stages'][number]['status'], outputs: Record<string, string> = {}) => ({
  id, label: id.toUpperCase(), playbook: null, runId: null, status, params: {}, from: {}, outputs, startedAt: null, finishedAt: null,
});
const run = (over: Partial<PipelineRun> = {}): PipelineRun => ({
  id: 'e1', pipeline: 'entrega', conversationId: 'chat:1', status: 'running', destination: null, inputs: { repo: 'r' },
  stages: [stage('dev', 'done', { versao: '2.5.0' }), stage('hml', 'running'), stage('gmud', 'pending'), stage('preencher', 'pending')],
  current: 1, requestedBy: 'user', skipQuestions: false, waiting: null, createdAt: '', updatedAt: '', finishedAt: null, ...over,
});
const pb = (name: string, how: string, outputs: string[] = []): Playbook => ({
  name, description: '', appliesTo: null, trigger: '', autonomy: 'ask', steps: [{ id: 'a', label: 'A', how }], instructions: '',
  variationOf: null, uses: 0, successes: 0, updatedAt: '', outputs: outputs.map((o) => ({ name: o, description: '' })),
});

describe('esteiras na tela', () => {
  it('estado, o que espera e o que está fora do destino', () => {
    expect(runState(run({ status: 'waiting', waiting: { kind: 'failure', stage: 'hml', message: 'deploy falhou' } }))).toEqual({ label: 'parada', tone: 'failed' });
    expect(waitingLine(run({ status: 'waiting', waiting: { kind: 'passage', stage: 'gmud' } }))).toBe('autorizar a passagem para GMUD');
    expect(waitingLine(run({ status: 'waiting', waiting: { kind: 'params', stage: 'hml', missing: ['imagem'] } }))).toBe('informar imagem para HML');
    expect(inScope(run({ destination: 'gmud' })).map((s) => s.outside)).toEqual([false, false, false, true]);
    expect(collectedData(run())).toEqual([{ name: 'versao', value: '2.5.0', stage: 'DEV' }]);
  });
  it('editor: ids, parâmetros, origens possíveis e problemas', () => {
    expect(stageIdFrom('Abrir GMUD', ['abrir-gmud'])).toBe('abrir-gmud-2');
    expect(paramsOf(pb('x', '{{versao}} e {{segredo:gh}}'))).toEqual(['versao']);
    const def = {
      name: 'entrega', description: '', inputs: [{ name: 'repo', description: '' }],
      stages: [{ id: 'dev', label: 'Dev', passage: 'auto' as const, options: [{ playbook: 'wf' }] }, { id: 'hml', label: 'HML', passage: 'ask' as const, options: [{ playbook: 'hml' }] }],
    };
    expect(sourcesFor(def, 1, [pb('wf', '', ['versao'])]).map((s) => s.value)).toEqual(['', 'entrada.repo', 'dev.versao', 'perguntar']);
    expect(draftProblems({ ...def, name: 'Entrega X' })[0]).toMatch(/Nome/);
    expect(draftProblems({ ...def, stages: [{ ...def.stages[0], options: [{ playbook: 'a' }, { playbook: 'b' }] }] })[0]).toMatch(/caminhos/);
    expect(draftProblems(def)).toEqual([]);
  });
});
