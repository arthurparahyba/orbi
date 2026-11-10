import type { Playbook } from '../../api';
import { playbookParams } from './editing';

/**
 * What a procedure receives ({{parameters}} of its steps, nothing to register)
 * and what it hands over when it finishes, for the next stage of an esteira.
 */
export function PlaybookData({ p }: { p: Playbook }) {
  const params = playbookParams(p.steps, p.instructions);
  return (
    <div className="pb-data">
      <div>
        <h4>Recebe</h4>
        {p.intent && <p className="small">{p.intent}</p>}
        {p.inputs?.length
          ? <p className="small">{p.inputs.map((x) => <code key={x.name}>{x.name}{x.concept ? `: ${x.concept}` : ''}</code>)}</p>
          : params.length ? <p className="small">{params.map((x) => <code key={x}>{x}</code>)}</p> : <p className="muted small">nada: não usa {'{{parâmetros}}'}</p>}
      </div>
      <div>
        <h4>Entrega</h4>
        {p.outputs.length
          ? <ul className="small">{p.outputs.map((o) => <li key={o.name}><code className="out-name">{o.name}</code> <span className="muted">{o.description}</span></li>)}</ul>
          : <p className="muted small">nada declarado. Para usar numa esteira, diga o que ele entrega (Editar).</p>}
      </div>
      {p.scripts.length > 0 && (
        <div>
          <h4>Scripts</h4>
          <ul className="small">
            {p.scripts.map((s) => (
              <li key={s.name}>
                <details>
                  <summary><code>{s.name}</code> <span className="muted">{s.description}</span>{s.effect === 'publica' && <span className="pill tiny">publica</span>}</summary>
                  <pre className="script-code">{s.code}</pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
