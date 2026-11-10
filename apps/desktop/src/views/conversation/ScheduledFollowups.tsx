import { api, type Followup } from '../../api';
import { useLive } from '../../hooks';
import { ClockIcon } from '../../components/Icons';
import { whenLabel } from './followups';

/**
 * The follow-ups waiting, in Pendências: when the Orbi comes back to which conversation and to
 * check what, with Cancelar. They do not wait for you, so they are not counted.
 */
export function ScheduledFollowups({ onOpen }: { onOpen(conversationId: string): void }) {
  const list = useLive(() => api.followups(), ['followups']);
  const items = list.data ?? [];
  if (!items.length) return null;
  return (
    <section className="inbox-group is-retornos" aria-label="Retornos agendados">
      <h3>Retornos agendados · {items.length}</h3>
      <ul>
        {items.map((f: Followup) => (
          <li key={f.id} className="followup-entry">
            <div className="row gap"><ClockIcon size={13} /><strong>Volto às {whenLabel(f.dueAt)}</strong></div>
            <p className="small">{f.note}</p>
            <div className="row gap">
              <button type="button" className="btn small" onClick={() => onOpen(f.conversationId)}>Abrir conversa →</button>
              <button type="button" className="btn small" onClick={() => void api.cancelFollowup(f.id).then(() => list.reload())}>Cancelar</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
