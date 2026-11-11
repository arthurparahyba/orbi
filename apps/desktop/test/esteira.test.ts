import { describe, expect, it } from 'vitest';
import { duration, esteiraView } from '../src/views/conversation/esteira';
import type { PipelineRun } from '../src/api';

const at = (min: number) => new Date(Date.UTC(2026, 10, 10, 20, min)).toISOString();
const stage = (id: string, status: PipelineRun['stages'][number]['status'], over: Partial<PipelineRun['stages'][number]> = {}) => ({
  id, label: id[0].toUpperCase() + id.slice(1), playbook: `${id}-pb`, runId: null, status, params: {}, from: {}, outputs: {}, startedAt: null, finishedAt: null, ...over,
});
const run: PipelineRun = {
  id: 'r', pipeline: 'entrega', conversationId: 'c', status: 'waiting', destination: 'gmud', inputs: {}, current: 2, requestedBy: 'você', skipQuestions: false,
  waiting: { kind: 'passage', stage: 'hml' },
  stages: [
    stage('build', 'done', { startedAt: at(0), finishedAt: at(4), outputs: { versao: '2.5.0' } }),
    stage('testes', 'done', { startedAt: at(4), finishedAt: at(10) }),
    stage('deploy', 'running', { startedAt: at(10) }),
    stage('hml', 'pending'),
    stage('gmud', 'pending'),
    stage('prod', 'pending'),
  ],
  createdAt: at(0), updatedAt: at(18), finishedAt: null,
};

describe('esteira no painel', () => {
  it('diz onde está e quanto tempo leva', () => {
    const v = esteiraView(run, Date.parse(at(18)));
    expect(v.where).toBe('Etapa 3 de 5 · até Gmud');
    expect(v.took).toBe('18 min');
  });

  it('etapas feitas numa linha com o que entregaram; a atual aberta; as próximas apagadas; depois do destino, fora', () => {
    const v = esteiraView(run, Date.parse(at(18)));
    expect(v.stages.map((s) => [s.id, s.state])).toEqual([['build', 'done'], ['testes', 'done'], ['deploy', 'now'], ['hml', 'next'], ['gmud', 'next']]);
    expect(v.stages[0]).toMatchObject({ took: '4 min', handed: 'versao=2.5.0' });
    expect(v.stages[4].destination).toBe(true);
  });

  it('concluída não tem etapa atual', () => {
    const v = esteiraView({ ...run, status: 'done', finishedAt: at(40) }, Date.parse(at(50)));
    expect(v.where).toBe('Concluída · 5 etapas');
    expect(v.stages.some((s) => s.state === 'now')).toBe(false);
    expect(v.took).toBe('40 min');
  });

  it('duração em palavras', () => {
    expect(duration(at(0), at(0))).toBe('< 1 min');
    expect(duration(at(0), new Date(Date.parse(at(0)) + 65 * 60_000).toISOString())).toBe('1 h 05');
    expect(duration(null, null)).toBeUndefined();
  });
});
