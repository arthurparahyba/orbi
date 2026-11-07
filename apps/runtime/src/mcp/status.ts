import type { InboxItem } from '../conversations/inbox.ts';
import type { PlaybookRun } from '../brain/store.ts';
import type { AgentRequest, AgentRequestStatus } from './requests.ts';

/** What orbi_status answers: short, no logs, no credentials. */
export interface RequestStatus {
  request_id: string;
  status: AgentRequestStatus;
  procedure: string | null;
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
export function requestStatus(req: AgentRequest, run: PlaybookRun | undefined, open: InboxItem[]): RequestStatus {
  const base = { request_id: req.id, procedure: req.procedure };
  if (req.status === 'done' || req.status === 'failed') {
    return { ...base, status: req.status, summary: req.summary ?? '', links: req.links };
  }
  const step = run ? currentStep(run) : undefined;
  const pending = open.find((i) => i.conversationId === req.conversationId);
  if (pending) {
    const what = pending.kind === 'question' ? 'resposta do desenvolvedor' : 'aprovação do desenvolvedor';
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
