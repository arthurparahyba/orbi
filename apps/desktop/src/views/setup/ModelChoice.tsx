import { useState } from 'react';
import { api, type ModelOption, type ModelStatus } from '../../api';
import { choiceOf, initialKind, initialModel, chooseLabel, type Draft } from './modelSetup';
import { OptionFields } from './OptionFields';

/** The options of this machine, the fields of the chosen one, Testar and Usar. Shared by the first opening and Autonomia › Modelo. */
export function ModelChoice({ status, onChosen, onRescan }: { status: ModelStatus; onChosen(): void; onRescan(): void }) {
  const [kind, setKind] = useState(() => initialKind(status));
  const option = status.options.find((o) => o.kind === kind);
  const [draft, setDraft] = useState<Draft>({ model: initialModel(status, option), apiKey: '', baseUrl: '' });
  const [result, setResult] = useState<{ ok: boolean; detail: string }>();
  const [busy, setBusy] = useState<'test' | 'use'>();
  const pick = (o: ModelOption) => { setKind(o.kind); setDraft({ model: initialModel(status, o), apiKey: '', baseUrl: '' }); setResult(undefined); };
  const run = async (what: 'test' | 'use') => {
    if (!option) return;
    setBusy(what);
    try {
      const r = what === 'test' ? await api.testModel(choiceOf(option, draft)) : await api.chooseModel(choiceOf(option, draft));
      setResult(r);
      if (what === 'use' && r.ok) onChosen();
    } catch (e) {
      setResult({ ok: false, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <div className="model-choice">
      <fieldset>
        <legend className="sr-only">Modelo</legend>
        {status.options.map((o) => (
          <label key={o.kind} className={`model-option ${o.kind === kind ? 'active' : ''} ${o.error ? 'broken' : ''}`}>
            <input type="radio" name="model-kind" checked={o.kind === kind} onChange={() => pick(o)} />
            <span className="model-option-body">
              <span className="row"><strong>{o.label}</strong>{o.source === 'plugin' && !o.error && <span className="pill pill-waiting">plugin desta máquina</span>}{o.error && <span className="pill pill-failed">não carregou</span>}</span>
              <span className="muted small">{o.error ? `${o.dir ?? ''}: ${o.error}` : o.description}</span>
              {o.kind === kind && !o.error && <OptionFields option={o} draft={draft} keySet={status.keySet && status.kind === o.kind} onChange={(d) => { setDraft(d); setResult(undefined); }} />}
            </span>
          </label>
        ))}
      </fieldset>
      {!status.options.some((o) => o.source === 'plugin') && (
        <p className="muted small">Se a empresa tem um plugin de modelo (como o Yara), coloque a pasta dele na pasta de plugins do Orbi e <button type="button" className="link-btn" onClick={onRescan}>procure de novo</button>.</p>
      )}
      {result && <p className={`model-result ${result.ok ? 'ok' : 'bad'}`} role="status">{result.ok ? '✓ ' : ''}{result.detail}</p>}
      <div className="row">
        <button type="button" className="btn primary" disabled={!option || !!option.error || !!busy} onClick={() => void run('use')}>{busy === 'use' ? 'Testando…' : chooseLabel(option)}</button>
        <button type="button" className="btn" disabled={!option || !!option.error || !!busy} onClick={() => void run('test')}>{busy === 'test' ? 'Testando…' : 'Testar'}</button>
      </div>
    </div>
  );
}
