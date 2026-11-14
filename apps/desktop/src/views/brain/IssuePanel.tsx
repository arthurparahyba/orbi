import { useState } from 'react';
import { api, type Diagnosis, type IssueDraft, type IssueSent } from '../../api';

/**
 * A issue de um defeito do Orbi, antes de sair (docs/funcionalidades/24): o texto exato e a lista
 * do que foi trocado, porque nada do trabalho do desenvolvedor vai no repositório do Orbi. Enviar
 * tenta o `gh` desta máquina; sem ele, abre a página do GitHub já preenchida para ele conferir.
 */
export function IssuePanel({ found, onClose }: { found: Diagnosis; onClose: () => void }) {
  const [draft, setDraft] = useState<IssueDraft>();
  const [sent, setSent] = useState<IssueSent>();
  const [error, setError] = useState<string>();
  if (!draft) {
    return (
      <button
        type="button"
        className="btn small"
        onClick={() => void api.issueDraft(found.id).then(setDraft).catch((e: Error) => setError(e.message))}
      >
        {error ? `Não deu para montar: ${error}` : 'Preparar issue'}
      </button>
    );
  }
  return (
    <div className="issue">
      <strong className="small">{draft.title}</strong>
      <pre className="code small">{draft.body}</pre>
      {draft.swaps.length > 0 && (
        <p className="small muted">
          Trocado antes de sair: {draft.swaps.map((s) => `${s.from} → ${s.to}`).join(' · ')}
        </p>
      )}
      {sent ? (
        <p className="small">
          {sent.via === 'gh' ? (sent.commented ? 'Entrou como ocorrência na issue que já existia: ' : 'Issue criada: ') : `${sent.why}. Confira e envie na página: `}
          <a href={sent.url} target="_blank" rel="noreferrer">{sent.via === 'gh' ? sent.url : 'abrir no GitHub preenchida'}</a>
        </p>
      ) : (
        <div className="run-actions">
          <button type="button" className="btn small" onClick={() => void api.sendIssue(found.id).then(setSent).catch((e: Error) => setError(e.message))}>Enviar</button>
          <button type="button" className="btn small" onClick={onClose}>Agora não</button>
          {error && <span className="small call-error">{error}</span>}
        </div>
      )}
    </div>
  );
}
