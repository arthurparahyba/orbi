import { CHANGE_LABEL, scriptDiff, type Script } from './stepDiff';

/**
 * The procedure's own scripts in the learning card: what each does, its code (open to read)
 * and, against the base, which ones are new or change. Approving the card approves this code.
 */
export function ScriptsPreview({ base, next, hasBase }: { base?: Script[]; next?: Script[]; hasBase: boolean }) {
  const scripts = scriptDiff(base, next, hasBase);
  if (!scripts.length) return null;
  return (
    <div className="learn-scripts">
      <span className="ui-kicker">Scripts</span>
      <ul>
        {scripts.map(({ script, change }) => (
          <li key={script.name} className={`script-item ${change}`}>
            <details open={change === 'new' || change === 'changed' || !hasBase}>
              <summary>
                <code>{script.name}</code>
                {script.effect === 'publica' && <span className="pill tiny">publica</span>}
                {hasBase && change !== 'same' && <span className={`diff-tag script-${change}`}>{CHANGE_LABEL[change]}</span>}
                {script.description && <span className="muted small"> {script.description}</span>}
              </summary>
              {change !== 'removed' && <pre className="script-code">{script.code}</pre>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
