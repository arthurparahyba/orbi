import { ScriptsPreview } from '../ScriptsPreview';
import { CorrectionPreview } from '../CorrectionPreview';
import { PipelinePreview } from '../PipelinePreview';
import type { PipelineDef } from '../../views/pipelines/model';
import { CHANGE_LABEL, stepDiff, type Step } from '../stepDiff';
import { api } from '../../api';
import { useLive } from '../../hooks';

/** What a learning card would save: procedures, esteiras and facts, against what exists. */
interface LearnItem { kind: string; payload: Record<string, any> }
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))];

/** What the Orbi is about to store, readable: the playbook as numbered steps, its trigger, parameters and the facts. */
export function LearningPreview({ detail }: { detail: string }) {
  // A variation (or a replacement) is shown against the playbook it comes from.
  const known = useLive(api.playbooks, ['brain']);
  let items: LearnItem[] = [];
  try { items = (JSON.parse(detail).items ?? []) as LearnItem[]; } catch { return null; }
  const playbooks = items.filter((i) => i.kind === 'playbook').map((i) => i.payload);
  const pipelines = items.filter((i) => i.kind === 'pipeline').map((i) => i.payload);
  const facts = items.filter((i) => i.kind !== 'playbook' && i.kind !== 'pipeline');
  return (
    <div className="learn-preview">
      {playbooks.map((pb) => {
        // Script code is Python: its braces are not parameters.
        const all = placeholders(JSON.stringify({ ...pb, scripts: undefined }));
        const params = all.filter((x) => !x.startsWith('segredo:'));
        const secrets = all.filter((x) => x.startsWith('segredo:')).map((x) => x.slice(8));
        const baseName: string | undefined = pb.variationOf ?? known.data?.find((k) => k.name === pb.name)?.name;
        const base = baseName ? known.data?.find((k) => k.name === baseName) : undefined;
        // A correction of a procedure that exists: only what changes, today and after.
        if (base && !pb.variationOf) return <CorrectionPreview key={pb.name} base={base} next={pb as never} />;
        return (
          <div key={pb.name} className="learn-pb">
            <div className="learn-pb-head">
              <span className="ui-kicker">Playbook</span> <strong>{pb.name}</strong>
              {pb.autonomy && <span className="pill tiny">{pb.autonomy === 'auto' ? 'automático' : pb.autonomy === 'observe' ? 'só observar' : 'pede aprovação'}</span>}
            </div>
            {base && (
              <p className="small muted learn-base">
                {pb.variationOf ? <>Variação de <code>{base.name}</code>; a base não muda.</> : <>Corrige o <code>{base.name}</code>: os passos marcados mudam, o resto fica.</>}
              </p>
            )}
            {pb.description && <p className="small">{pb.description}</p>}
            <dl className="learn-meta">
              {pb.trigger && <div><dt>Quando</dt><dd>{pb.trigger}</dd></div>}
              {pb.appliesTo && <div><dt>Vale para</dt><dd>todo {pb.appliesTo}</dd></div>}
              {params.length > 0 && <div><dt>Parâmetros</dt><dd>{params.map((x) => <code key={x}>{x}</code>)}</dd></div>}
              {Array.isArray(pb.outputs) && pb.outputs.length > 0 && <div><dt>Entrega</dt><dd>{pb.outputs.map((o: { name: string }) => <code key={o.name} className="out-name">{o.name}</code>)}</dd></div>}
              {secrets.length > 0 && <div><dt>Credenciais</dt><dd>{secrets.map((x) => <span key={x} className="secret-ref">🔒 {x}</span>)} <span className="muted">no cofre do sistema</span></dd></div>}
            </dl>
            {base ? <DiffSteps base={base.steps} next={pb.steps ?? []} /> : (
              <ol className="steps static">
                {(pb.steps ?? []).map((st: Step, i: number) => (
                  <li key={st.id ?? i} className="step">
                    <span className="step-dot">{i + 1}</span>
                    <span className="step-body"><span className="step-label">{st.label}</span>{st.how && <span className="step-note">{st.how}</span>}</span>
                  </li>
                ))}
              </ol>
            )}
            <ScriptsPreview base={base?.scripts} next={pb.scripts} hasBase={!!base && !pb.variationOf} />
          </div>
        );
      })}
      {pipelines.map((p) => <PipelinePreview key={p.name} p={p as PipelineDef} />)}
      {facts.length > 0 && (
        <div className="learn-facts">
          <span className="ui-kicker">Fatos para o cérebro</span>
          <ul>
            {facts.map((f, i) => (
              <li key={i}>
                {f.kind === 'edge'
                  ? <><code>{f.payload.from}</code> <span className="muted">{f.payload.rel}</span> <code>{f.payload.to}</code></>
                  : f.kind === 'entity'
                    ? <><span className="pill tiny">{f.payload.type}</span> <code>{f.payload.id}</code></>
                    : <><span className="pill tiny">{f.kind}</span> {JSON.stringify(f.payload).slice(0, 120)}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Steps marked against the base: igual, muda (with what it was), novo, sai. */
export function DiffSteps({ base, next }: { base: Step[]; next: Step[] }) {
  let n = 0;
  return (
    <>
      <p className="diff-legend small muted">
        {(['same', 'changed', 'new', 'removed'] as const).map((k) => <span key={k} className={`diff-key is-${k}`}>{CHANGE_LABEL[k]}</span>)}
      </p>
      <ol className="steps static diff">
        {stepDiff(base, next).map(({ step, change, before }, i) => (
          <li key={`${step.id}-${i}`} className={`step is-${change}`}>
            <span className="step-dot">{change === 'removed' ? '–' : ++n}</span>
            <span className="step-body">
              <span className="step-label">{change === 'removed' ? <s>{step.label}</s> : step.label}</span>
              {change === 'changed' && before && <span className="step-note">antes: {before.label}{before.how && before.how !== step.how ? ` · ${before.how}` : ''}</span>}
              {change !== 'removed' && step.how && <span className="step-note">{step.how}</span>}
            </span>
            <span className="diff-tag">{CHANGE_LABEL[change]}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
