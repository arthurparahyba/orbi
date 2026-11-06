import { useEffect, useMemo, useState } from 'react';
import { api, type Autonomy, type BrainSnapshot, type Edge, type Entity, type Playbook, type PlaybookRun } from '../api';
import { usePoll } from '../hooks';

type Tab = 'grafo' | 'playbooks' | 'execucoes' | 'ontologia';

/** One stable color per ontology type (validated on the dark surface). */
const TYPE_COLORS: Record<string, string> = {
  Classe: '#B794F6', Repositorio: '#6CA8FF', Workflow: '#4CC38A', Ambiente: '#F2B13C', Ferramenta: '#5ED3D3',
  Portal: '#FF9F6B', Playbook: '#F2B13C', Incidente: '#FF8A8A', Mudanca: '#E58FD0', Historia: '#A3C76D', Pessoa: '#A9B0BB',
};
const colorOf = (type: string) => TYPE_COLORS[type] ?? '#A9B0BB';
const labelOf = (e: Entity) => String(e.props.name ?? e.props.nome ?? e.props.title ?? e.id.split(':').pop());
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function BrainView() {
  const brain = usePoll(api.brain, 5_000);
  const [tab, setTab] = useState<Tab>('grafo');
  const [selected, setSelected] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [exported, setExported] = useState<string>();
  const s = brain.data?.stats;

  return (
    <div className="cerebro">
      <header className="brain-head">
        <div>
          <h1>Cérebro</h1>
          <p className="muted">O que o Orbi aprendeu: tipos da ontologia, coisas do seu ambiente, como elas se relacionam e os procedimentos (playbooks).</p>
        </div>
        <div className="stats" aria-label="Resumo do cérebro">
          <Stat n={s?.entities} label="entidades" />
          <Stat n={s?.edges} label="relações" />
          <Stat n={s?.playbooks} label="playbooks" />
          <Stat n={brain.data?.gaps.length} label="lacunas" warn />
        </div>
      </header>
      <div className="tabs" role="tablist">
        {([['grafo', 'Conhecimento'], ['playbooks', 'Playbooks'], ['execucoes', 'Execuções'], ['ontologia', 'Ontologia']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
        <span className="spacer" />
        <button type="button" className="btn small" onClick={async () => { const r = await api.exportBrain(); setExported(`${r.written} notas em ${r.dir}`); }}>
          Exportar Markdown
        </button>
      </div>
      {exported && <p className="muted small pad-x">Exportado: {exported}</p>}
      {!brain.data ? (
        <p className="muted pad">{brain.error ? `Erro: ${brain.error}` : 'Carregando…'}</p>
      ) : tab === 'grafo' ? (
        <div className="graph-layout">
          <div className="graph-col">
            <div className="graph-tools">
              <label className="sr-only" htmlFor="brain-q">Filtrar entidades</label>
              <input id="brain-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar (ex.: novo-front, Portal)…" />
              <Legend snapshot={brain.data} />
            </div>
            <Graph snapshot={brain.data} selected={selected} onSelect={setSelected} query={query} />
            {brain.data.gaps.length > 0 && <Gaps snapshot={brain.data} onSelect={setSelected} />}
          </div>
          <EntityDetail id={selected} snapshot={brain.data} onSelect={setSelected} />
        </div>
      ) : tab === 'playbooks' ? (
        <Playbooks />
      ) : tab === 'execucoes' ? (
        <Runs />
      ) : (
        <Ontology snapshot={brain.data} />
      )}
    </div>
  );
}

function Stat({ n, label, warn }: { n?: number; label: string; warn?: boolean }) {
  return <div className={`stat ${warn && n ? 'warn' : ''}`}><strong>{n ?? '–'}</strong><span>{label}</span></div>;
}

function Legend({ snapshot }: { snapshot: BrainSnapshot }) {
  const used = [...new Set(snapshot.entities.map((e) => e.type))];
  return (
    <ul className="legend" aria-label="Legenda de tipos">
      {used.map((t) => <li key={t}><span className="swatch" style={{ background: colorOf(t) }} />{t}</li>)}
    </ul>
  );
}

// ── force-directed layout, computed once per graph shape ────────────────────
interface P { id: string; x: number; y: number; vx: number; vy: number }
function layout(entities: Entity[], edges: Edge[], w: number, h: number): Map<string, P> {
  const nodes: P[] = entities.map((e, i) => {
    const a = (i / Math.max(entities.length, 1)) * Math.PI * 2;
    return { id: e.id, x: w / 2 + Math.cos(a) * w * 0.3, y: h / 2 + Math.sin(a) * h * 0.3, vx: 0, vy: 0 };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  for (let it = 0; it < 300; it++) {
    const t = 1 - it / 300;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      const d2 = Math.max(dx * dx + dy * dy, 25);
      const f = 12000 / d2;
      const d = Math.sqrt(d2); dx /= d; dy /= d;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const l of links) {
      const a = byId.get(l.from)!, b = byId.get(l.to)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 130) * 0.03;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.002; n.vy += (h / 2 - n.y) * 0.003;
      n.x += Math.max(-20, Math.min(20, n.vx)) * t; n.y += Math.max(-20, Math.min(20, n.vy)) * t;
      n.vx *= 0.5; n.vy *= 0.5;
      n.x = Math.max(40, Math.min(w - 40, n.x)); n.y = Math.max(30, Math.min(h - 30, n.y));
    }
  }
  return byId;
}

function Graph({ snapshot, selected, onSelect, query }: { snapshot: BrainSnapshot; selected?: string; onSelect(id: string): void; query: string }) {
  const W = 900, H = 560;
  const current = useMemo(() => snapshot.edges.filter((e) => !e.validTo), [snapshot.edges]);
  const shape = snapshot.entities.map((e) => e.id).join('|') + '#' + current.map((e) => `${e.from}>${e.to}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pos = useMemo(() => layout(snapshot.entities, current, W, H), [shape]);
  const q = query.trim().toLowerCase();
  const match = (e: Entity) => !q || `${e.id} ${e.type} ${labelOf(e)}`.toLowerCase().includes(q);
  const neighbors = new Set(selected ? current.flatMap((e) => (e.from === selected ? [e.to] : e.to === selected ? [e.from] : [])) : []);
  const gapIds = new Set(snapshot.gaps.map((g) => g.entity));

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="graph" role="img" aria-label={`Grafo com ${snapshot.entities.length} entidades e ${current.length} relações`}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#4A5160" />
          </marker>
        </defs>
        {current.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const hot = selected && (e.from === selected || e.to === selected);
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          const ex = b.x - (dx / d) * 14, ey = b.y - (dy / d) * 14;
          return (
            <g key={i} className={`edge ${hot ? 'hot' : selected ? 'dim' : ''}`}>
              <line x1={a.x} y1={a.y} x2={ex} y2={ey} markerEnd="url(#arrow)" />
              {hot && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle">{e.rel}</text>}
            </g>
          );
        })}
        {snapshot.entities.map((e) => {
          const p = pos.get(e.id);
          if (!p) return null;
          const isSel = e.id === selected;
          const dim = (selected && !isSel && !neighbors.has(e.id)) || !match(e);
          return (
            <g
              key={e.id}
              className={`node ${isSel ? 'sel' : ''} ${dim ? 'dim' : ''}`}
              transform={`translate(${p.x},${p.y})`}
              onClick={() => onSelect(e.id)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') onSelect(e.id); }}
              tabIndex={0}
              role="button"
              aria-label={`${e.type} ${labelOf(e)}`}
            >
              <circle r={isSel ? 11 : e.type === 'Classe' ? 9 : 7} fill={colorOf(e.type)} />
              {gapIds.has(e.id) && <circle r={14} className="gap-ring" />}
              <text y={-14} textAnchor="middle">{labelOf(e)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Gaps({ snapshot, onSelect }: { snapshot: BrainSnapshot; onSelect(id: string): void }) {
  return (
    <section className="gaps">
      <h3>Lacunas que o Orbi vai perguntar</h3>
      <ul>
        {snapshot.gaps.map((g, i) => (
          <li key={i}>
            <button type="button" className="link-btn" onClick={() => onSelect(g.entity)}>{g.entity}</button>
            <span className="muted"> não tem a relação </span><code>{g.missing}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntityDetail({ id, snapshot, onSelect }: { id?: string; snapshot: BrainSnapshot; onSelect(id: string): void }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.entity>>>();
  useEffect(() => {
    setDetail(undefined);
    if (id) api.entity(id).then(setDetail, () => setDetail(undefined));
  }, [id, snapshot.stats.edges, snapshot.stats.entities]);

  if (!id) return <aside className="detail muted pad">Selecione um nó para ver o que o Orbi sabe sobre ele, com as relações atuais e o histórico.</aside>;
  if (!detail) return <aside className="detail muted pad">Carregando…</aside>;
  const e = detail.entity;
  const history = snapshot.edges.filter((x) => (x.from === e.id || x.to === e.id) && x.validTo);
  const props = Object.entries(e.props).filter(([k]) => !['name', 'nome'].includes(k));

  return (
    <aside className="detail" aria-label={`Detalhes de ${e.id}`}>
      <span className="type-chip" style={{ borderColor: colorOf(e.type), color: colorOf(e.type) }}>{e.type}</span>
      <h2>{labelOf(e)}</h2>
      <p className="mono muted small">{e.id}</p>
      {e.body && <p>{e.body}</p>}
      {props.length > 0 && (
        <dl className="props">
          {props.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd></div>)}
        </dl>
      )}
      <h3>Relações</h3>
      <ul className="rels">
        {detail.relations.out.map((r, i) => (
          <li key={`o${i}`}><code>{r.rel}</code> → <button type="button" className="link-btn" onClick={() => onSelect(r.to)}>{r.to}</button><span className="muted small"> desde {fmt(r.validFrom)}</span></li>
        ))}
        {detail.relations.in.map((r, i) => (
          <li key={`i${i}`}><button type="button" className="link-btn" onClick={() => onSelect(r.from)}>{r.from}</button> → <code>{r.rel}</code><span className="muted small"> desde {fmt(r.validFrom)}</span></li>
        ))}
        {detail.relations.out.length + detail.relations.in.length === 0 && <li className="muted">Nenhuma relação ainda.</li>}
      </ul>
      {history.length > 0 && (
        <>
          <h3>Histórico</h3>
          <ul className="rels past">
            {history.map((r, i) => <li key={i}><s>{r.from} <code>{r.rel}</code> {r.to}</s><span className="muted small"> {fmt(r.validFrom)} – {fmt(r.validTo!)}</span></li>)}
          </ul>
        </>
      )}
      <p className="muted small">Atualizado em {fmt(e.updatedAt)} · {detail.nearby.length} entidades a até 2 saltos</p>
    </aside>
  );
}

const AUTONOMY_LABEL: Record<Autonomy, string> = { observe: 'Só observar', ask: 'Perguntar', auto: 'Automático' };

function Playbooks() {
  const pbs = usePoll(api.playbooks, 5_000);
  const [open, setOpen] = useState<string>();
  if (!pbs.data) return <p className="muted pad">Carregando…</p>;
  if (pbs.data.length === 0) return <p className="muted pad">Nenhum procedimento aprendido ainda. Ensine um na tela Conversa.</p>;
  return (
    <div className="pb-list">
      {pbs.data.map((p: Playbook) => (
        <article key={p.name} className="pb">
          <header>
            <button type="button" className="pb-title" onClick={() => setOpen(open === p.name ? undefined : p.name)} aria-expanded={open === p.name}>
              <strong>{p.name}</strong>
              <span className="muted">{p.description}</span>
            </button>
            <div className="pb-meta">
              <span className="muted small">{p.uses} usos · {p.uses ? Math.round((p.successes / p.uses) * 100) : 0}% sucesso</span>
              <Segmented
                label={`Autonomia de ${p.name}`}
                value={p.autonomy}
                options={(['observe', 'ask', 'auto'] as Autonomy[]).map((a) => ({ value: a, label: AUTONOMY_LABEL[a] }))}
                onChange={async (a) => { await api.setPlaybookAutonomy(p.name, a); await pbs.reload(); }}
              />
            </div>
          </header>
          {open === p.name && (
            <div className="pb-body">
              <p className="muted small">Gatilho: {p.trigger}{p.appliesTo ? ` · aplica-se a ${p.appliesTo}` : ''}</p>
              <ol className="steps static">
                {p.steps.map((s, i) => <li key={s.id} className="step"><span className="step-dot">{i + 1}</span><span className="step-body"><span className="step-label">{s.label}</span><span className="step-note">{s.how}</span></span></li>)}
              </ol>
              {p.instructions && <pre className="code small">{p.instructions}</pre>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export function Segmented<T extends string>(props: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange(v: T): void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={props.value === o.value} className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Runs() {
  const runs = usePoll(api.runs, 3_000);
  if (!runs.data) return <p className="muted pad">Carregando…</p>;
  if (runs.data.length === 0) return <p className="muted pad">Nenhuma execução ainda.</p>;
  return (
    <div className="table-scroll pad-x">
      <table className="runs">
        <thead><tr><th scope="col">Playbook</th><th scope="col">Status</th><th scope="col">Passos</th><th scope="col">Início</th><th scope="col">Fim</th></tr></thead>
        <tbody>
          {runs.data.map((r: PlaybookRun) => (
            <tr key={r.id}>
              <td><strong>{r.playbook}</strong></td>
              <td><span className={`pill pill-${r.status}`}>{r.status === 'done' ? 'Concluído' : r.status === 'failed' ? 'Falhou' : r.status === 'waiting' ? 'Aguardando' : 'Executando'}</span></td>
              <td>
                <span className="mini-steps">
                  {r.steps.map((s) => <span key={s.id} className={`mini is-${s.status}`} title={`${s.label}: ${s.status}${s.note ? ` — ${s.note}` : ''}`} />)}
                </span>
              </td>
              <td className="muted">{fmt(r.startedAt)}</td>
              <td className="muted">{r.finishedAt ? fmt(r.finishedAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ontology({ snapshot }: { snapshot: BrainSnapshot }) {
  const counts = new Map<string, number>();
  for (const e of snapshot.entities) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  return (
    <div className="onto-grid">
      {snapshot.types.map((t) => (
        <article key={t.name} className="onto-card" style={{ borderTopColor: colorOf(t.name) }}>
          <header><strong>{t.name}</strong><span className="muted small">{counts.get(t.name) ?? 0} entidades</span></header>
          <p className="muted small">{t.description}</p>
          {Object.keys(t.relations).length > 0 && (
            <ul className="rels small">
              {Object.entries(t.relations).map(([rel, target]) => (
                <li key={rel}><code>{rel}</code> → {target === '*' ? 'qualquer' : target}{t.requires.includes(rel) && <span className="pill tiny">obrigatória</span>}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
