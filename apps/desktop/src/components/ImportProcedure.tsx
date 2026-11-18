import { useEffect, useState } from 'react';
import { api, type PackageSeen, type ProcedurePackage } from '../api';

/**
 * A caixinha de um procedimento que chegou de outra pessoa (documento 30). Ela existe para uma
 * decisão só — aplicar ou não — e por isso é uma caixinha: o nome, o domínio, a descrição e os
 * números. Os números abrem ao clicar, um de cada vez, para quem quiser ver antes de aplicar;
 * em especial os scripts, que são código de outra pessoa que vai rodar nesta máquina.
 *
 * O que ela **não** faz é pedir segredo: o Orbi pede na hora de usar, e grava direto no cofre. E
 * não tem caixinha de "eu confio": o procedimento entra em N1, então cada passo pergunta antes.
 */
export function ImportProcedure({ pack, fileName, onClose, onDone }: {
  pack: ProcedurePackage;
  fileName: string;
  onClose(): void;
  onDone(name: string): void;
}) {
  const [seen, setSeen] = useState<PackageSeen>();
  const [open, setOpen] = useState<'passos' | 'entradas' | 'entregas' | 'scripts'>();
  const [failed, setFailed] = useState<string>();
  const [applying, setApplying] = useState(false);
  const p = pack.procedure;

  useEffect(() => { void api.seePackage(pack).then(setSeen, (e: Error) => setFailed(e.message)); }, [pack]);

  const apply = async () => {
    setApplying(true);
    setFailed(undefined);
    try {
      onDone((await api.importProcedure(pack)).name);
    } catch (error) {
      setFailed((error as Error).message);
    } finally {
      setApplying(false);
    }
  };
  const chip = (which: NonNullable<typeof open>, label: string) => (
    <button type="button" className={`pill click ${open === which ? 'on' : ''}`} onClick={() => setOpen(open === which ? undefined : which)}>{label}</button>
  );

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Importar procedimento">
      <div className="import-card">
        <p className="muted small"><code>{fileName}</code></p>
        <h3>Isto é um procedimento do Orbi</h3>

        <div className="import-what">
          <code className="import-name">{p.name}</code>
          {p.domain && <span className="pill domain">{p.domain}</span>}
          <p className="small">{p.description}</p>
        </div>

        <div className="row gap wrap">
          {chip('passos', `${p.steps.length} ${p.steps.length === 1 ? 'passo' : 'passos'}`)}
          {!!p.inputs?.length && chip('entradas', `${p.inputs.length} ${p.inputs.length === 1 ? 'entrada' : 'entradas'}`)}
          {!!p.outputs.length && chip('entregas', `${p.outputs.length} ${p.outputs.length === 1 ? 'entrega' : 'entregas'}`)}
          {!!p.scripts.length && chip('scripts', `${p.scripts.length} ${p.scripts.length === 1 ? 'script' : 'scripts'}`)}
          <span className="pill warn">entra em N1</span>
        </div>

        {open && <ImportDetail pack={pack} open={open} />}

        <p className="muted small">
          Entra em N1: pergunta antes de cada passo, inclusive antes de rodar script.
          {seen?.secretsToAsk.length
            ? ` Quando rodar, ele vai pedir ${seen.secretsToAsk.join(', ')} — nenhuma senha veio neste arquivo.`
            : ' Nenhuma senha veio neste arquivo.'}
        </p>
        {seen && <ImportChanges seen={seen} />}

        <div className="row gap">
          <button type="button" className="btn small primary" disabled={applying || seen?.conflict} onClick={() => void apply()}>
            {applying ? 'Importando…' : 'Importar'}
          </button>
          <button type="button" className="btn small" onClick={onClose}>Cancelar</button>
        </div>
        {failed && <p className="small error">{failed}</p>}
      </div>
    </div>
  );
}

/** O detalhe do número clicado. Um de cada vez: a caixinha não vira listagem. */
function ImportDetail({ pack, open }: { pack: ProcedurePackage; open: 'passos' | 'entradas' | 'entregas' | 'scripts' }) {
  const p = pack.procedure;
  return (
    <div className="import-detail small">
      {open === 'passos' && <ol>{p.steps.map((s) => <li key={s.id}>{s.label} <span className="muted">{s.how}</span></li>)}</ol>}
      {open === 'entradas' && <ul>{(p.inputs ?? []).map((i) => <li key={i.name}><code>{i.name}</code> <span className="muted">{i.concept ?? 'sem conceito'}</span></li>)}</ul>}
      {open === 'entregas' && <ul>{p.outputs.map((o) => <li key={o.name}><code>{o.name}</code> <span className="muted">{o.description}</span></li>)}</ul>}
      {open === 'scripts' && (
        <ul>
          {p.scripts.map((s) => (
            <li key={s.name}>
              <details>
                <summary><code>{s.name}</code> <span className="muted">{s.description}</span></summary>
                <pre className="script-code">{s.code}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O que vai mudar aqui, só quando há o que dizer: conflito, conceito novo, fato novo. */
function ImportChanges({ seen }: { seen: PackageSeen }) {
  if (seen.conflict) return <p className="small error">Já existe um procedimento chamado <code>{seen.name}</code> aqui. Renomeie ou apague o seu antes de importar este.</p>;
  const lines = [
    seen.newTypes.length ? `aprende ${seen.newTypes.length === 1 ? 'o conceito' : 'os conceitos'} ${seen.newTypes.join(', ')}` : '',
    seen.keptTypes.length ? `mantém como está ${seen.keptTypes.join(', ')}` : '',
    seen.newFacts.length ? `traz ${seen.newFacts.length} ${seen.newFacts.length === 1 ? 'fato' : 'fatos'}` : '',
  ].filter(Boolean);
  return lines.length ? <p className="muted small">Ao importar: {lines.join(' · ')}.</p> : null;
}
