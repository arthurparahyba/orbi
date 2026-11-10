import { useState } from 'react';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { ModelChoice } from '../setup/ModelChoice';
import { ModelTiersEditor } from '../../components/model/ModelTiersEditor';

/** Autonomia › Modelo: the model in use, Testar, and Trocar (the same options as the first opening). */
export function ModelPage({ onChanged }: { onChanged(): void }) {
  const status = useLoad(api.model);
  const [changing, setChanging] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string }>();
  const s = status.data;
  if (!s) return <section className="auto-list"><div className="auto-row muted">{status.error ? `Erro: ${status.error}` : 'Carregando…'}</div></section>;
  const current = s.options.find((o) => o.kind === s.kind);
  const plugins = s.options.filter((o) => o.source === 'plugin');
  return (
    <>
      <section className="auto-list">
        <div className="auto-row">
          <div>
            <strong>{current?.source === 'anthropic' ? 'Claude' : current?.label ?? s.kind} · {s.model}</strong>
            <p className="muted small">
              {current?.source === 'plugin' ? 'Plugin desta máquina; o acesso é o da implementação do plugin.' : s.keySet ? 'Chave guardada no .env da pasta de dados.' : 'Sem chave.'}
              {s.problem ? ` Problema: ${s.problem}.` : ''}
            </p>
            {test && <p className={`model-result ${test.ok ? 'ok' : 'bad'}`}>{test.detail}</p>}
          </div>
          <div className="row">
            <span className={`pill ${s.ready ? 'pill-done' : 'pill-failed'}`}>{s.ready ? 'pronto' : 'não está pronto'}</span>
            <button type="button" className="btn small" onClick={async () => setTest(await api.testModel({ kind: s.kind, model: s.model }))}>Testar</button>
            <button type="button" className="btn small" onClick={() => setChanging((c) => !c)}>{changing ? 'Cancelar' : 'Trocar o modelo'}</button>
          </div>
        </div>
      </section>
      {changing && (
        <section className="auto-list pad-16">
          <ModelChoice status={s} onChosen={() => { setChanging(false); void status.reload(); onChanged(); }} onRescan={async () => { await api.rescanPlugins(); await status.reload(); }} />
        </section>
      )}
      <ModelTiersEditor key={`${s.kind}:${s.model}`} />
      <section className="auto-list">
        <h2>Plugins nesta máquina</h2>
        {plugins.length === 0 && <div className="auto-row muted">Nenhum plugin de modelo. Se a empresa tem um (como o Yara), coloque a pasta dele na pasta de plugins do Orbi.</div>}
        {plugins.map((p) => (
          <div key={p.kind} className="auto-row"><div><strong>{p.label}</strong><p className="muted small">{p.error ? `não carregou: ${p.error}` : `${p.description} · modelos: ${p.models.join(', ') || '—'}`}</p></div><span className={`pill ${p.error ? 'pill-failed' : 'pill-done'}`}>{p.error ? 'erro' : 'carregado'}</span></div>
        ))}
        <div className="auto-row"><button type="button" className="btn small" onClick={async () => { await api.rescanPlugins(); await status.reload(); }}>Procurar plugins de novo</button></div>
      </section>
    </>
  );
}
