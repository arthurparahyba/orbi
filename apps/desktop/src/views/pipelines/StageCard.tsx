import type { PipelineStage, Playbook } from '../../api';
import { paramsOf } from './model';

/** A stage: its procedure (one per branch), what each receives and from where, what it hands over. */
export function StageCard({ stage, index, playbooks, gaps }: { stage: PipelineStage; index: number; playbooks: Playbook[]; gaps: Array<{ playbook: string; param: string }> }) {
  return (
    <div className={`pl-stage ${stage.options.length > 1 ? 'branched' : ''}`}>
      <div className="pl-stage-head"><span className="step-dot">{index + 1}</span><strong>{stage.label}</strong></div>
      <div className="pl-options">
        {stage.options.map((o) => {
          const pb = playbooks.find((x) => x.name === o.playbook);
          const params = paramsOf(pb);
          return (
            <div key={o.playbook} className="pl-option">
              {o.when && <span className="small info-text">se {o.when.field} = {o.when.equals}</span>}
              <code className="pl-pb">{o.playbook}</code>
              {!pb && <span className="small err-text">procedimento não existe mais</span>}
              {params.length > 0 && (
                <span className="small muted">
                  Recebe: {params.map((x) => {
                    const gap = gaps.some((g) => g.playbook === o.playbook && g.param === x);
                    const source = o.map?.[x];
                    return <span key={x} className={gap ? 'warn-text' : ''}>{x}{source ? ` ← ${source}` : ''}{gap ? ' (pergunta)' : ''} </span>;
                  })}
                </span>
              )}
              <span className="small muted">
                Entrega: {pb?.outputs.length ? pb.outputs.map((x) => <code key={x.name} className="out-name">{x.name}</code>) : 'nada declarado'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
