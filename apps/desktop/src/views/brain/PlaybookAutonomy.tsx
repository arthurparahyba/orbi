import { useCallback } from 'react';
import { api, type Playbook } from '../../api';
import { useLive } from '../../hooks';
import { EFFECT_LABEL, LEVEL_HINT, LEVEL_LABEL } from '../../components/effect';
import { nextStep, when } from './levels';

const LEVELS = [1, 2, 3] as const;

/**
 * A procedure's autonomy: the three levels with the current one marked, the way to the next,
 * the ceiling, what it already knows how to do (and does alone at this level), and the history.
 */
export function PlaybookAutonomyPanel({ p }: { p: Playbook }) {
  const load = useCallback(() => api.playbookAutonomy(p.name), [p.name]);
  const info = useLive(load, ['brain']);
  const next = nextStep(p, info.data?.runsForN3 ?? 3);
  const set = (change: { level?: 1 | 2 | 3; levelMax?: 1 | 2 | 3 }) => api.setPlaybookLevel(p.name, change);
  const observe = p.autonomy === 'observe';
  return (
    <section className="pb-autonomy" aria-label={`Autonomia de ${p.name}`}>
      <div className="row gap">
        <strong>Autonomia</strong>
        <span className="muted small">sobe sozinha com o uso</span>
        <span className="spacer" />
        <label className="small"><input type="checkbox" checked={observe} onChange={(e) => void api.setPlaybookAutonomy(p.name, e.target.checked ? 'observe' : p.level === 3 ? 'auto' : 'ask')} /> só observar</label>
      </div>
      <div className="level-steps" role="radiogroup" aria-label="Nível">
        {LEVELS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={p.level === l} disabled={observe || l > p.levelMax}
            className={`level-step ${p.level === l ? 'is-current' : ''}`} onClick={() => void set({ level: l })}>
            <strong>{LEVEL_LABEL[l]}{p.level === l ? ' ← agora' : ''}</strong>
            <span>{LEVEL_HINT[l]}</span>
          </button>
        ))}
      </div>
      <div className="row gap small">
        {next && (
          <>
            <span className="level-progress" aria-hidden="true">{Array.from({ length: next.total }, (_, i) => <i key={i} className={i < next.done ? 'is-done' : ''} />)}</span>
            <span>{next.text}</span>
          </>
        )}
        <span className="spacer" />
        <label>Nível máximo{' '}
          <select value={p.levelMax} onChange={(e) => void set({ levelMax: Number(e.target.value) as 1 | 2 | 3 })}>
            {[...LEVELS].reverse().map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
        </label>
      </div>
      <KnownActions data={info.data?.knownActions} />
      <History events={info.data?.events} />
    </section>
  );
}

function KnownActions({ data }: { data?: Array<{ fingerprint: string; summary: string; effect: keyof typeof EFFECT_LABEL; step: string | null; count: number }> }) {
  if (!data) return null;
  if (data.length === 0) return <p className="muted small">Ainda não há ações conhecidas: elas entram quando uma execução termina sem desvio.</p>;
  return (
    <details className="pb-known">
      <summary>Ações conhecidas · {data.length}</summary>
      <ul>
        {data.map((a) => (
          <li key={a.fingerprint}>
            <span className={`effect is-${a.effect}`}>{EFFECT_LABEL[a.effect].tag}</span>
            <span>{a.summary}</span>
            <span className="muted small">{a.step ? `passo ${a.step} · ` : ''}{a.count}×</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function History({ events }: { events?: Array<{ id: string; from: string; to: string; reason: string; createdAt: string }> }) {
  if (!events?.length) return null;
  return (
    <details className="pb-history">
      <summary>Histórico · {events.length}</summary>
      <ul>{events.map((e) => <li key={e.id}><strong>{e.from} → {e.to}</strong> <span className="muted small">{when(e.createdAt)} · {e.reason}</span></li>)}</ul>
    </details>
  );
}
