import { api, type PipelineRun } from '../../api';
import { useLive } from '../../hooks';
import { PipelineIcon } from '../../components/Icons';
import { collectedData, waitingLine } from '../pipelines/model';
import { PipelineDecision } from './PipelineDecision';
import { EndDelivery } from './EndDelivery';
import { Steps } from './NotebookParts';
import { esteiraView, isActive, type EsteiraStage } from './esteira';

/**
 * Beside a conversation that delivers an esteira: the delivery as a whole. Stages that ended take
 * one line (how long, what they handed over); the current one is open, with its procedure's steps
 * and the decision it waits for; the next ones are dimmed. Replaces the bar on top of the chat.
 */
export function EsteiraPanel({ run, conversationId }: { run: PipelineRun; conversationId: string }) {
  const nb = useLive(() => api.notebook(conversationId), ['runs', 'inbox', 'brain', 'conversations'], [conversationId]);
  const view = esteiraView(run);
  const data = collectedData(run);
  // The steps shown are those of the stage running now: only once its own procedure started.
  const nowStage = run.stages[run.current];
  const ownSteps = !!nowStage?.runId && nb.data?.procedure?.name === nowStage.playbook;
  return (
    <aside className="notebook esteira" aria-label={`Esteira ${run.pipeline}`}>
      <h2><PipelineIcon size={15} /> Esteira {run.pipeline}</h2>
      <p className="muted small es-where"><span>{view.where}</span>{view.took && <span>{view.took}</span>}</p>
      <ol className="es-stages">
        {view.stages.map((s) => (
          <li key={s.id} className={`es-stage is-${s.state}`}>
            <StageHead s={s} />
            {s.state === 'now' && ownSteps && nb.data!.steps.length > 0 && <Steps steps={nb.data!.steps} />}
            {s.state === 'now' && run.waiting && <PipelineDecision run={run} line={waitingLine(run) ?? ''} />}
          </li>
        ))}
      </ol>
      {data.length > 0 && (
        <details className="nb-sec es-data">
          <summary>Dados passados entre etapas ({data.length})</summary>
          <ul className="nb-list">{data.map((d) => <li key={`${d.stage}-${d.name}`}><code>{d.name}</code> = {d.value} <span className="muted">· {d.stage}</span></li>)}</ul>
        </details>
      )}
      {isActive(run) && <EndDelivery runId={run.id} />}
    </aside>
  );
}

const MARK: Record<EsteiraStage['state'], string> = { done: '✓', failed: '✗', skipped: '–', now: '●', next: '○' };

function StageHead({ s }: { s: EsteiraStage }) {
  return (
    <>
      <div className="es-head">
        <span><span className="es-mark" aria-hidden="true">{MARK[s.state]}</span> {s.state === 'now' ? <strong>{s.label}</strong> : s.label}{s.destination && <span className="muted" aria-label="destino"> ⚑</span>}</span>
        <span className="muted small">{s.state === 'next' ? s.playbook ?? '' : s.took ?? ''}</span>
      </div>
      {(s.state === 'done' || s.state === 'failed') && s.handed && <p className="mono es-handed">entregou {s.handed}</p>}
    </>
  );
}
