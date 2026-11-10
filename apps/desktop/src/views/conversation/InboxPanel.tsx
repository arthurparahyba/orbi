import type { InboxItem } from '../../api';
import { groupInbox, needsYou } from './inbox';
import { InboxEntry } from './InboxEntry';
import { ScheduledFollowups } from './ScheduledFollowups';
import { XIcon } from '../../components/Icons';

/**
 * What is open, in three groups: what waits for your approval (with Aprovar and Ir até),
 * questions, and notes that only inform (a level went up, with Manter).
 */
export function InboxPanel(props: { items: InboxItem[]; current?: string; onClose?(): void; onOpen(conversationId: string): void; onGoTo(item: InboxItem): void }) {
  const groups = groupInbox(props.items);
  const waiting = props.items.filter(needsYou).length;
  return (
    <aside className="inbox" aria-label="Pendências">
      <div className="inbox-head">
        <h2>Pendências <span className="muted">{waiting}</span></h2>
        {props.onClose && <button type="button" className="icon-btn" onClick={props.onClose} title="Fechar Pendências" aria-label="Fechar Pendências"><XIcon size={15} /></button>}
      </div>
      {groups.length === 0 && <p className="muted pad">Nada esperando por você.</p>}
      {groups.map((g) => (
        <section key={g.key} className={`inbox-group is-${g.key}`} aria-label={g.title}>
          <h3>{g.title} · {g.items.length}</h3>
          <ul>
            {g.items.map((i) => (
              <li key={i.id}>
                <InboxEntry item={i} here={i.conversationId === props.current} onOpen={() => props.onOpen(i.conversationId)} onGoTo={() => props.onGoTo(i)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ScheduledFollowups onOpen={props.onOpen} />
    </aside>
  );
}
