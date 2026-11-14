import { useState } from 'react';
import { api, type PlaybookRun, type RunCall } from '../../api';
import { useLive } from '../../hooks';
import { groupCalls, isProblem, MARK_LABEL, ms, runTotals, size, STATUS_LABEL } from './runCalls';

/** One call: what was called, how it ended, how long it took and how much it made the model read. */
function Call({ c }: { c: RunCall }) {
  return (
    <li className={`call is-${c.status}`}>
      <span className="call-head">
        <code>{c.tool}</code>
        {c.summary && <span className="muted"> {c.summary}</span>}
      </span>
      <span className="call-tags">
        <span className="pill">{STATUS_LABEL[c.status]}</span>
        {c.approval && c.approval !== 'sozinha' && <span className="pill">{c.approval}</span>}
        {c.marks.map((m) => <span key={m} className={`pill mark-${m}`}>{MARK_LABEL[m]}</span>)}
        <span className="muted small">{ms(c.durationMs)}{c.chars > 0 && ` · ${size(c.chars)} ao modelo`}</span>
      </span>
      {c.error && <span className="call-error small">{c.error}</span>}
    </li>
  );
}

/**
 * What an execution actually did (docs/funcionalidades/24): every call, by step, with what failed,
 * what waited for you and what cost a lot to read. "Copiar execução completa" hands the whole
 * thing over as text, without cuts, to whoever is going to debug it.
 */
export function RunDetail({ run }: { run: PlaybookRun }) {
  const calls = useLive(() => api.runCalls(run.id), ['runs'], [run.id]);
  const [onlyProblems, setOnlyProblems] = useState(false);
  if (!calls.data) return <p className="muted small">Carregando as chamadas…</p>;
  if (calls.data.length === 0) return <p className="muted small">Sem registro desta execução: ela é anterior ao registro de chamadas.</p>;
  const totals = runTotals(calls.data);
  const shown = onlyProblems ? calls.data.filter(isProblem) : calls.data;
  return (
    <section className="run-detail" aria-label={`Detalhes da execução de ${run.playbook}`}>
      <p className="run-totals small">
        <strong>{totals.calls}</strong> chamadas · <strong>{size(totals.chars)}</strong> caracteres ao modelo · <strong>{totals.approvals}</strong> aprovações
        {totals.failures > 0 && <> · <strong>{totals.failures}</strong> falhas</>}
        {totals.expensive > 0 && <> · <span className="mark-caro">{totals.expensive} leituras caras ({size(totals.expensiveChars)} caracteres)</span></>}
      </p>
      <div className="run-actions">
        <button type="button" className={`btn small ${onlyProblems ? 'on' : ''}`} aria-pressed={onlyProblems} onClick={() => setOnlyProblems((v) => !v)}>Só problemas</button>
        <button type="button" className="btn small" onClick={() => void copyRun(run.id)}>Copiar execução completa</button>
      </div>
      {groupCalls(shown, run.steps).map((g) => (
        <div key={g.step ?? '-'} className="call-step">
          <span className="ui-kicker">{g.title}</span>
          <ul className="calls">{g.calls.map((c) => <Call key={c.id} c={c} />)}</ul>
        </div>
      ))}
      {shown.length === 0 && <p className="muted small">Nenhum problema nesta execução.</p>}
    </section>
  );
}

/** The whole execution as text, in the clipboard: to paste where it will be read. */
async function copyRun(id: string): Promise<void> {
  const text = await api.runTranscript(id);
  await navigator.clipboard?.writeText(text);
}
