import { useState } from 'react';
import { api, type Playbook } from '../../api';
import { useLive } from '../../hooks';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { PencilIcon, TrashIcon } from '../../components/Icons';
import { PlaybookEditor } from './PlaybookEditor';
import { PlaybookData } from './PlaybookData';
import { PlaybookAutonomyPanel } from './PlaybookAutonomy';
import { PlaybookIdeas } from './PlaybookIdeas';
import { PlaybookLearnings } from './PlaybookLearnings';
import { levelPill } from './levels';

/** Each variation right after the playbook it came from. */
export function withVariations(list: Playbook[]): Playbook[] {
  const names = new Set(list.map((p) => p.name));
  const out: Playbook[] = [];
  const add = (p: Playbook) => {
    out.push(p);
    for (const v of list) if (v.variationOf === p.name) add(v);
  };
  for (const p of list) if (!p.variationOf || !names.has(p.variationOf)) add(p);
  return out;
}

/** Learned procedures, each with its level of autonomy (it grows with use). */
export function Playbooks() {
  const pbs = useLive(api.playbooks, ['brain']);
  const [open, setOpen] = useState<string>();
  const [mode, setMode] = useState<{ name: string; kind: 'edit' | 'delete' }>();
  if (!pbs.data) return <p className="muted pad">Carregando…</p>;
  if (pbs.data.length === 0) return <p className="muted pad">Nenhum procedimento aprendido ainda. Ensine um na tela Conversa.</p>;
  return (
    <div className="pb-list">
      {withVariations(pbs.data).map((p: Playbook) => (
        <article key={p.name} className={`pb ${p.variationOf ? 'is-variation' : ''}`}>
          <header>
            <button type="button" className="pb-title" onClick={() => setOpen(open === p.name ? undefined : p.name)} aria-expanded={open === p.name}>
              <strong>{p.name}</strong>
              <span className="muted">{p.description}</span>
            </button>
            <PlaybookLinks p={p} all={pbs.data ?? []} onOpen={setOpen} />
            <div className="pb-meta">
              <span className="muted small">{p.uses ? `${p.successes} de ${p.uses} deram certo` : 'ainda não usado'}</span>
              <span className={`pill level-pill is-n${p.level} ${p.autonomy === 'observe' ? 'is-observe' : ''}`} title="Autonomia: sobe sozinha com o uso">{levelPill(p)}</span>
            </div>
          </header>
          {open === p.name && mode?.name === p.name && mode.kind === 'edit' ? (
            <div className="pb-body">
              <PlaybookEditor playbook={p} onDone={(saved) => { setMode(undefined); if (saved) void pbs.reload(); }} />
            </div>
          ) : open === p.name && (
            <div className="pb-body">
              <div className="row gap detail-actions">
                <button type="button" className="btn small" onClick={() => setMode({ name: p.name, kind: 'edit' })}><PencilIcon size={13} /> Editar</button>
                <button type="button" className="btn small" onClick={() => setMode({ name: p.name, kind: 'delete' })}><TrashIcon size={13} /> Apagar</button>
              </div>
              {mode?.name === p.name && mode.kind === 'delete' && (
                <ConfirmDelete
                  what={`o procedimento ${p.name}`}
                  consequences={deleteConsequences(p, pbs.data ?? [])}
                  onConfirm={async () => { await api.deletePlaybook(p.name); setMode(undefined); setOpen(undefined); await pbs.reload(); }}
                  onCancel={() => setMode(undefined)}
                />
              )}
              <p className="muted small">Gatilho: {p.trigger}{p.appliesTo ? ` · aplica-se a ${p.appliesTo}` : ''}</p>
              <PlaybookAutonomyPanel p={p} />
              <PlaybookData p={p} />
              <ol className="steps static">
                {p.steps.map((s, i) => <li key={s.id} className="step"><span className="step-dot">{i + 1}</span><span className="step-body"><span className="step-label">{s.label}</span><span className="step-note">{s.how}</span></span></li>)}
              </ol>
              {p.instructions && <pre className="code small">{p.instructions}</pre>}
              <PlaybookLearnings p={p} />
              <PlaybookIdeas name={p.name} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/** What deleting a playbook means, in words. */
export function deleteConsequences(p: Playbook, all: Playbook[]): string[] {
  const variations = all.filter((o) => o.variationOf === p.name).map((o) => o.name);
  return [
    'O Orbi deixa de saber fazer isso; se pedirem de novo, ele aprende do zero.',
    ...(variations.length ? [`${variations.length === 1 ? 'A variação' : 'As variações'} ${variations.join(', ')} ${variations.length === 1 ? 'continua' : 'continuam'}, sem a ligação com este.`] : []),
    ...(p.uses ? [`As ${p.uses} execuções passadas continuam em Execuções.`] : []),
  ];
}

/** "variação de X" on a variation; "Variações: …" on a base. */
function PlaybookLinks({ p, all, onOpen }: { p: Playbook; all: Playbook[]; onOpen(name: string): void }) {
  const variations = all.filter((o) => o.variationOf === p.name);
  if (!p.variationOf && variations.length === 0) return null;
  return (
    <div className="pb-links small">
      {p.variationOf && <span className="pill info">variação de {p.variationOf}</span>}
      {variations.length > 0 && (
        <>
          <span className="muted">Variações:</span>
          {variations.map((v) => <button key={v.name} type="button" className="pb-chip" onClick={() => onOpen(v.name)}>{v.name}</button>)}
        </>
      )}
    </div>
  );
}
