import type { InboxItem } from '../conversations/inbox.ts';
import type { PlaybookRun } from '../brain/store.ts';
import type { AgentRequest, AgentRequestStatus } from './requests.ts';
import type { PipelineRun } from '../pipelines/runs.ts';
import { collected } from '../pipelines/engine.ts';

/** What orbi_status answers: short, no logs, no credentials. */
export interface RequestStatus {
  request_id: string;
  status: AgentRequestStatus;
  procedure: string | null;
  /** For an esteira: its name, the stage ("2 de 4 · Homologação"), each stage's state and the data so far. */
  pipeline?: { name: string; stage: string; stages: Array<{ label: string; status: string; procedure?: string }>; data: Record<string, string>; destination?: string };
  /** "2/4 Rodar os testes" while a procedure runs. */
  step?: string;
  /** What the developer has to do before Orbi goes on. */
  waiting_for?: string;
  summary?: string;
  links?: string[];
  hint?: string;
}

/**
 * The state of a delegated request, from what Orbi reported (agent_reply),
 * what waits for the developer in that conversation, and the procedure's run.
 */
export function requestStatus(req: AgentRequest, run: PlaybookRun | undefined, open: InboxItem[], pipeline?: PipelineRun): RequestStatus {
  const base = { request_id: req.id, procedure: req.procedure, ...(pipeline ? { pipeline: pipelineView(pipeline) } : {}) };
  if (req.status === 'done' || req.status === 'failed') {
    return { ...base, status: req.status, summary: req.summary ?? '', links: req.links };
  }
  if (pipeline?.status === 'cancelled') return { ...base, status: 'failed', summary: 'O desenvolvedor encerrou a entrega.' };
  // In an esteira, the last run may be the previous stage's: only the running stage's run has a step to show.
  const current = pipeline?.stages[pipeline.current];
  const live = run && (!pipeline || (current?.status === 'running' && current.runId === run.id));
  const step = live ? currentStep(run) : undefined;
  const pending = open.find((i) => i.conversationId === req.conversationId);
  if (pending) {
    const what =
      pending.kind === 'question' ? 'resposta do desenvolvedor' : pending.kind === 'pipeline' ? 'decisão do desenvolvedor na esteira' : 'aprovação do desenvolvedor';
    return {
      ...base,
      status: 'waiting',
      ...(step ? { step } : {}),
      waiting_for: `${what}: ${pending.title}`,
      hint: 'Só o desenvolvedor decide, no app do Orbi. Siga com outra coisa e consulte de novo mais tarde.',
    };
  }
  return { ...base, status: 'running', ...(step ? { step } : {}), hint: 'Consulte de novo em alguns minutos.' };
}

function currentStep(run: PlaybookRun): string | undefined {
  const i = run.steps.findIndex((s) => s.status !== 'done' && s.status !== 'skipped');
  if (i < 0) return `${run.steps.length}/${run.steps.length} concluído, finalizando`;
  return `${i + 1}/${run.steps.length} ${run.steps[i].label}`;
}

function pipelineView(run: PipelineRun): NonNullable<RequestStatus['pipeline']> {
  const stage = run.stages[run.current];
  const data = Object.fromEntries(
    Object.entries(collected(run).stages).flatMap(([id, out]) => Object.entries(out).map(([k, v]) => [`${id}.${k}`, v])),
  );
  return {
    name: run.pipeline,
    stage: `${run.current + 1} de ${run.stages.length} · ${stage?.label ?? ''}`,
    stages: run.stages.map((s) => ({ label: s.label, status: s.status, ...(s.playbook ? { procedure: s.playbook } : {}) })),
    data,
    ...(run.destination ? { destination: run.destination } : {}),
  };
}
