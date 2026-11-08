import { useState } from 'react';
import { api, type PipelineRun } from '../../api';
import { useLive } from '../../hooks';
import { collectedData, inScope, runState, waitingLine } from '../pipelines/model';
import { PipelineDecision } from './PipelineDecision';
import { EndDelivery } from './EndDelivery';

/**
 * On top of a conversation that is a delivery: the stages (destination
 * flagged, those past it greyed), what it waits for with the buttons to
 * decide, and the data handed over so far.
 */
export function PipelineBar({ conversationId }: { conversationId: string }) {
  const live = useLive(() => api.pipelineRunIn(conversationId), ['pipelines']);
  const [showData, setShowData] = useState(false);
  const run: PipelineRun | null | undefined = live.data;
  if (!run) return null;
  const state = runState(run);
  const data = collectedData(run);
  return (
    <section className="pl-bar" aria-label={`Esteira ${run.pipeline}`}>
      <div className="row gap8">
        <ol className="pl-strip" aria-label="Etapas">
          {inScope(run).map((s, i) => (
            <li key={s.id} className={`pl-chip is-${s.status} ${i === run.current && run.status !== 'done' ? 'current' : ''} ${s.outside ? 'outside' : ''}`}>
              {s.status === 'done' ? '✓ ' : s.status === 'failed' ? '✗ ' : ''}{s.label}
              {run.destination === s.id && <span className="pl-flag" aria-label="destino"> ⚑</span>}
            </li>
          ))}
        </ol>
        <span className={`pill pill-${state.tone}`}>{state.label}</span>
        {data.length > 0 && <button type="button" className="link-btn small" aria-expanded={showData} onClick={() => setShowData(!showData)}>dados ({data.length})</button>}
        {(run.status === 'running' || run.status === 'waiting') && <EndDelivery runId={run.id} />}
      </div>
      {showData && (
        <ul className="pl-data small">
          {data.map((d) => <li key={`${d.stage}-${d.name}`}><code>{d.name}</code> = {d.value} <span className="muted">· {d.stage}</span></li>)}
        </ul>
      )}
      {run.status === 'waiting' && <PipelineDecision run={run} line={waitingLine(run) ?? ''} />}
    </section>
  );
}
