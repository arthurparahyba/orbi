import { api } from '../../api';
import { useLive } from '../../hooks';

/**
 * Ideas the end-of-run review kept for a procedure (docs/funcionalidades/19): good, but not worth
 * changing the steps now, because the procedure gets to the end and what matters is its autonomy.
 * To apply one, ask in a conversation; Descartar takes it off the list.
 */
export function PlaybookIdeas({ name }: { name: string }) {
  const ideas = useLive(() => api.reviewNotes({ playbook: name, kind: 'idea', status: 'kept' }), ['brain'], [name]);
  if (!ideas.data?.length) return null;
  return (
    <section className="pb-ideas small" aria-label="Ideias guardadas">
      <strong>Ideias guardadas</strong>
      <p className="muted">Não mudam nada agora. Para aplicar uma, peça numa conversa.</p>
      <ul>
        {ideas.data.map((i) => (
          <li key={i.id}>
            <span>{i.text}{i.times > 1 && <span className="muted"> · vista {i.times} vezes</span>}</span>
            <button type="button" className="btn small" onClick={() => void api.setReviewNote(i.id, 'dismissed')}>Descartar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
