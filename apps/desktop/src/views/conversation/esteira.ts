import type { PipelineRun } from '../../api';
import { inScope } from '../pipelines/model';

type Stage = PipelineRun['stages'][number];

/** "4 min", "1 h 05", "< 1 min": how long a stage (or the delivery) took, or has been going. */
export function duration(from: string | null, to: string | null, now = Date.now()): string | undefined {
  if (!from) return undefined;
  const ms = (to ? Date.parse(to) : now) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const min = Math.round(ms / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/**
 * The delivery as the panel shows it: where it is ("Etapa 3 de 5 · até GMUD"), and each stage
 * in scope with how it reads: done and failed on one line (with what it handed over), the current
 * one open, the next ones dimmed. Stages past the destination stay out.
 */
export function esteiraView(run: PipelineRun, now = Date.now()) {
  const stages = inScope(run).filter((s) => !s.outside);
  const current = run.status === 'done' || run.status === 'cancelled' ? -1 : run.current;
  const dest = run.destination ? run.stages.find((s) => s.id === run.destination)?.label : undefined;
  const at = Math.min(run.current + 1, stages.length);
  return {
    where: run.status === 'done' ? `Concluída · ${stages.length} etapas` : run.status === 'cancelled' ? 'Encerrada' : `Etapa ${at} de ${stages.length}${dest ? ` · até ${dest}` : ''}`,
    took: duration(run.createdAt, run.finishedAt, now),
    stages: stages.map((s, i) => ({
      id: s.id,
      label: s.label,
      playbook: s.playbook,
      destination: run.destination === s.id,
      state: (i === current ? 'now' : s.status === 'done' ? 'done' : s.status === 'failed' ? 'failed' : s.status === 'skipped' ? 'skipped' : 'next') as 'now' | 'done' | 'failed' | 'skipped' | 'next',
      took: duration(s.startedAt, s.finishedAt, now),
      handed: Object.entries(s.outputs).map(([k, v]) => `${k}=${v}`).join(' · '),
    })),
  };
}

export type EsteiraStage = ReturnType<typeof esteiraView>['stages'][number];
export const isActive = (run: Pick<PipelineRun, 'status'> | null | undefined) => !!run && (run.status === 'running' || run.status === 'waiting');
export type { Stage };
