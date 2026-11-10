import type { OntologyType } from '@orbi/contracts';

/**
 * The parts of a learning card over concepts (docs/funcionalidades/18): the intent, the concepts
 * (new, or what changes in one that exists) and where each specific of the explanation went.
 */
interface LearnItem { kind: string; payload: Record<string, any> }

export function LearnIntent({ intents }: { intents: string[] }) {
  if (!intents.length) return null;
  return (
    <div className="learn-part">
      <span className="ui-kicker">Intenção</span>
      {intents.map((t) => <p key={t} className="small">{t}</p>)}
    </div>
  );
}

const entries = (o: unknown) => Object.entries((o ?? {}) as Record<string, string>);

export function LearnConcepts({ items, known }: { items: LearnItem[]; known: OntologyType[] | undefined }) {
  const types = items.filter((i) => i.kind === 'type').map((i) => i.payload);
  if (!types.length) return null;
  return (
    <div className="learn-part">
      <span className="ui-kicker">Conceitos</span>
      <ul className="learn-concepts">
        {types.map((t) => {
          const before = known?.find((k) => k.name === t.name);
          const props = entries(t.props), knows = entries(t.knows), rels = entries(t.relations);
          return (
            <li key={t.name}>
              <strong>{t.name}</strong> <span className={`pill tiny ${before ? '' : 'is-new'}`}>{before ? 'ampliado' : 'novo'}</span>
              {t.description && <span className="muted small"> {t.description}</span>}
              {(rels.length > 0 || props.length > 0 || knows.length > 0) && (
                <dl className="learn-concept-meta small">
                  {rels.length > 0 && <div><dt>Ligações</dt><dd>{rels.map(([k, v]) => <code key={k}>{k} → {v}</code>)}</dd></div>}
                  {props.length > 0 && <div><dt>Tem</dt><dd>{props.map(([k, v]) => <span key={k}><code>{k}</code> {v}</span>)}</dd></div>}
                  {knows.length > 0 && <div><dt>Sabe</dt><dd>{knows.map(([k, v]) => <span key={k}><code>{k}</code> {v}</span>)}</dd></div>}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LearnLeftOut({ leftOut }: { leftOut: Array<{ value: string; where: string }> }) {
  if (!leftOut.length) return null;
  return (
    <div className="learn-part">
      <span className="ui-kicker">Ficou fora do procedimento</span>
      <dl className="learn-leftout small">
        {leftOut.map((x, i) => <div key={i}><dt><code>{x.value}</code></dt><dd>{x.where}</dd></div>)}
      </dl>
    </div>
  );
}
