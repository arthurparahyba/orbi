import { useEffect, useState } from 'react';
import { api, type Playbook, type ShareProcedure } from '../../api';

/**
 * Exportar um procedimento para mandar a alguém (documento 30). A tela existe por causa de uma
 * frase: **vocabulário viaja, dados não.** O que o procedimento é vai sozinho; o que é desta
 * máquina fica, com o porquê de cada um escrito; e cada fato é uma escolha, com o que ele revela
 * do lado — a decisão só é informada se o valor aparecer antes dela.
 */
export function PlaybookShare({ p, onClose }: { p: Playbook; onClose(): void }) {
  const [seen, setSeen] = useState<ShareProcedure>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [learnings, setLearnings] = useState(false);
  const [done, setDone] = useState<{ file: string; bytes: number }>();
  const [failed, setFailed] = useState<string>();

  useEffect(() => { void api.shareProcedure(p.name).then(setSeen, (e: Error) => setFailed(e.message)); }, [p.name]);

  const toggle = (id: string) => setChosen((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  const generate = async () => {
    setFailed(undefined);
    try {
      setDone(await api.exportProcedure(p.name, { facts: chosen, learnings }) as { file: string; bytes: number });
    } catch (error) {
      setFailed((error as Error).message);
    }
  };

  if (failed && !seen) return <p className="small error">Não deu para ler o procedimento: {failed}</p>;
  if (!seen) return <p className="muted small">Vendo o que vai…</p>;
  return (
    <div className="pb-share">
      <h4>Exportar para mandar a alguém</h4>
      <p className="small">{counts(seen)}{seen.types.length ? ` · leva os conceitos ${seen.types.join(', ')}` : ''}</p>
      {seen.secrets.length > 0 && (
        <p className="muted small">
          Segredos: {seen.secrets.map((n) => <code key={n}>{n}</code>)} — só o nome. O valor nunca sai do cofre; quem recebe cria o dele quando rodar.
        </p>
      )}

      <details>
        <summary className="small">O que fica nesta máquina ({seen.leftBehind.length})</summary>
        <ul className="small muted">{seen.leftBehind.map((l) => <li key={l.field}>{l.why}</li>)}</ul>
      </details>

      {seen.facts.length > 0 && (
        <div className="share-facts">
          <h5>Os seus dados (escolha um por um)</h5>
          {seen.facts.map((f) => (
            <label key={f.id} className="small">
              <input type="checkbox" checked={chosen.includes(f.id)} onChange={() => toggle(f.id)} />
              <code>{f.id}</code> <span className="muted">{f.reveals}</span>
            </label>
          ))}
        </div>
      )}
      {seen.learnings > 0 && (
        <label className="small">
          <input type="checkbox" checked={learnings} onChange={(e) => setLearnings(e.target.checked)} />
          Mandar os {seen.learnings} aprendizados dos passos <span className="muted">(úteis para quem recebe, mas citam os seus sistemas pelo nome)</span>
        </label>
      )}

      <div className="row gap">
        <button type="button" className="btn small primary" onClick={() => void generate()}>Gerar o pacote</button>
        <button type="button" className="btn small" onClick={onClose}>Fechar</button>
      </div>
      {failed && <p className="small error">Não deu para gerar: {failed}</p>}
      {done && (
        <p className="small">
          Pronto: <code>{done.file}</code> ({Math.max(1, Math.round(done.bytes / 1024))} KB). Abra e leia antes de mandar — é texto.
        </p>
      )}
    </div>
  );
}

/** Os números do pacote, na ordem em que a pessoa pensa neles. */
export function counts(seen: ShareProcedure): string {
  const { steps, inputs, outputs, scripts } = seen.counts;
  const parts = [`${steps} ${steps === 1 ? 'passo' : 'passos'}`];
  if (inputs) parts.push(`${inputs} ${inputs === 1 ? 'entrada' : 'entradas'}`);
  if (outputs) parts.push(`${outputs} ${outputs === 1 ? 'entrega' : 'entregas'}`);
  if (scripts) parts.push(`${scripts} ${scripts === 1 ? 'script' : 'scripts'}`);
  return parts.join(', ');
}
