import { useEffect, useRef, useState } from 'react';
import { api, type Recording } from '../api';
import type { Narrator } from '../audio';
import { useChanges, useLoad } from '../hooks';
import { concerns } from '../live';
import { mmss } from './Demonstration';
import { GlobeIcon, KeyIcon, MicIcon, MicOffIcon } from './Icons';

/**
 * A recording as the runtime sees it: fetched again whenever it announces a
 * change, with a local clock for the elapsed time. Calls `onClosed` once it
 * is done or discarded.
 */
function useRecording(initial: Recording, onClosed: () => void) {
  const [rec, setRec] = useState<Recording>(initial);
  const [now, setNow] = useState(Date.now());
  const closed = useRef(onClosed);
  closed.current = onClosed;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const fetched = useLoad(() => api.recording(initial.id), [initial.id]);
  useChanges((c) => { if (concerns(c, ['recording'], initial.id)) void fetched.reload(); });
  useEffect(() => {
    const r = fetched.data;
    if (!r) return;
    setRec(r);
    if (r.status === 'done' || r.status === 'discarded') closed.current();
  }, [fetched.data]);

  const finish = async (discard: boolean) => {
    setRec(await api.stopRecording(rec.id, discard));
    if (discard) closed.current();
  };
  const elapsed = (rec.finishedAt ? Date.parse(rec.finishedAt) : now) - Date.parse(rec.startedAt);
  return { rec, elapsed, finish };
}

/** Live view while recording: what was done and what was said, side by side. */
export function RecordingPanel({ initial, narrator, onClosed }: { initial: Recording; narrator?: Narrator; onClosed(): void }) {
  const { rec, elapsed, finish } = useRecording(initial, onClosed);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  useEffect(() => { if (narrator) narrator.events.onLevel = setLevel; }, [narrator]);

  const stop = async (discard: boolean) => { await narrator?.stop(); await finish(discard); };
  const toggleMic = () => { narrator?.setMuted(!muted); setMuted(!muted); };
  const recording = rec.status === 'recording';

  return (
    <section className={`demo-panel is-${rec.status}`} aria-label="Gravação da demonstração" aria-live="polite">
      <header className="demo-head">
        <span className={`rec-dot ${recording ? 'on' : ''}`} aria-hidden="true" />
        <strong>{recording ? 'Gravando' : 'Transcrevendo e montando o passo a passo…'}</strong>
        <span className="muted mono">{mmss(elapsed)}</span>
        <span className="spacer" />
        {recording && narrator && (
          <button type="button" className={`icon-btn ${muted ? 'off' : ''}`} onClick={toggleMic} aria-pressed={!muted} title={muted ? 'Retomar narração' : 'Pausar narração'}>
            {muted ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
            <span className="level" style={{ transform: `scaleX(${level})` }} />
          </button>
        )}
        {recording && (
          <>
            <button type="button" className="btn small" onClick={() => stop(true)}>Descartar</button>
            <button type="button" className="btn small primary" onClick={() => stop(false)}>Terminar e aprender</button>
          </>
        )}
      </header>
      <div className="demo-cols">
        <Actions rec={rec} />
        <Narration rec={rec} />
      </div>
      {rec.secrets.length > 0 && (
        <p className="muted small demo-secrets"><KeyIcon size={12} /> No cofre: {rec.secrets.join(', ')}</p>
      )}
    </section>
  );
}

/** Keeps the newest item of a growing list in view. */
function useFollow(length: number) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [length]);
  return end;
}

function Actions({ rec }: { rec: Recording }) {
  const end = useFollow(rec.actions.length);
  return (
    <div>
      <h3><GlobeIcon size={12} /> O que você fez <span className="muted">{rec.actions.length}</span></h3>
      <ol className="demo-list">
        {rec.actions.length === 0 && <li className="muted">Use o Chrome que abriu: cada clique e campo preenchido aparece aqui.</li>}
        {rec.actions.map((a, i) => (
          <li key={i} ref={i === rec.actions.length - 1 ? end : undefined} className={`act ${a.kind}`}>
            <span className="mono muted">{mmss(a.t)}</span>
            <span>{a.secret ? <><KeyIcon size={11} /> {a.text.replace(/ \(credencial guardada no cofre\)/, '')}</> : a.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Narration({ rec }: { rec: Recording }) {
  const end = useFollow(rec.narration.length);
  const pending = rec.narration.filter((n) => n.status === 'pending').length;
  return (
    <div>
      <h3><MicIcon size={12} /> O que você explicou {pending > 0 && <span className="spinner" />}</h3>
      <ol className="demo-list">
        {!rec.narrated && <li className="muted">Sem narração nesta gravação.</li>}
        {rec.narrated && rec.narration.length === 0 && <li className="muted">Fale normalmente; os trechos aparecem a cada pausa.</li>}
        {rec.narration.map((n, i) => (
          <li key={i} ref={i === rec.narration.length - 1 ? end : undefined} className={`speech is-${n.status}`}>
            <span className="mono muted">{mmss(n.t)}</span>
            <span>{n.status === 'pending' ? 'transcrevendo…' : n.status === 'error' ? `não transcrito: ${n.error}` : `“${n.text}”`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
