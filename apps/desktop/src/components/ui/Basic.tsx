import type { UiComponent } from '@orbi/contracts';
import { AlertIcon, BulbIcon, CheckIcon, ClockIcon, XIcon } from '../Icons';

/** Small cards: status, table, learning note. */
export function Status({ c }: { c: Extract<UiComponent, { component: 'status' }> }) {
  return (
    <section className={`ui-card status is-${c.state}`} role="status">
      <span className="status-dot">{c.state === 'running' ? <span className="spinner" /> : c.state === 'success' ? <CheckIcon size={14} /> : c.state === 'error' ? <XIcon size={14} /> : c.state === 'warning' ? <AlertIcon size={14} /> : <ClockIcon size={14} />}</span>
      <span>
        <strong>{c.title}</strong>
        <span className="muted block">{c.text}</span>
      </span>
    </section>
  );
}

export function Table({ c }: { c: Extract<UiComponent, { component: 'table' }> }) {
  return (
    <section className="ui-card table-card">
      <header className="ui-card-head"><strong>{c.title}</strong></header>
      <div className="table-scroll">
        <table>
          <thead><tr>{c.columns.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{c.rows.map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function Learning({ c }: { c: Extract<UiComponent, { component: 'learning' }> }) {
  return (
    <section className="ui-card learning">
      <header className="ui-card-head"><span className="ui-icon info"><BulbIcon /></span><strong>{c.title}</strong></header>
      <ul>{c.items.map((it, i) => <li key={i}><span className="pill">{it.kind}</span> {it.summary}</li>)}</ul>
    </section>
  );
}
