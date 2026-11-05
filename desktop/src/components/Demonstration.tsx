import { useEffect, useRef, useState } from 'react';
import { api, type Recording } from '../api';
import { Narrator } from '../audio';
import { GlobeIcon, KeyIcon, MicIcon, MicOffIcon, RecordIcon, XIcon } from './Icons';

const mmss = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

/** "Ensinar pelo navegador": choose where to start and whether to narrate. */
export function StartDemonstration({ conversationId, defaultUrl, onStarted, onCancel }: {
  conversationId: string; defaultUrl?: string; onStarted(rec: Recording, narrator?: Narrator): void; onCancel(): void;
}) {
  const [url, setUrl] = useState(defaultUrl ?? '');
  const [narrate, setNarrate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const rec = await api.startRecording(conversationId, url.trim() || undefined, narrate);
      let narrator: Narrator | undefined;
      if (narrate) {
        narrator = new Narrator({ onSegment: (at, ms, wav) => { void api.sendAudio(rec.id, at, ms, wav).catch(() => {}); } });
        try {
          await narrator.start();
        } catch (e) {
          narrator = undefined;
          setError(`Sem microfone (${e instanceof Error ? e.message : e}); gravando só os cliques.`);
        }
      }
      onStarted(rec, narrator);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="demo-start" aria-label="Ensinar pelo navegador">
      <header className="row gap">
        <span className="ui-icon rec"><RecordIcon size={14} /></span>
        <strong>Ensinar pelo navegador</strong>
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancelar"><XIcon size={14} /></button>
      </header>
      <p className="muted small">
        O Vigia abre um Chrome e anota cada passo que você fizer. Se quiser, explique em voz alta: a fala vira o porquê de cada passo.
        Senhas e usuários digitados vão direto para o cofre, nunca para o cérebro.
      </p>
      <label className="field">
        <span>Começar em (opcional)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://portal.interno/login" />
      </label>
      <label className="check">
        <input type="checkbox" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} /> Narrar por áudio
      </label>
      {error && <p className="banner small" role="alert">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn primary" onClick={start} disabled={busy}><RecordIcon size={14} /> {busy ? 'Abrindo o Chrome…' : 'Começar a gravar'}</button>
      </div>
    </section>
  );
}

/** Live view while recording: what was done and what was said, side by side. */
export function RecordingPanel({ initial, narrator, onClosed }: { initial: Recording; narrator?: Narrator; onClosed(): void }) {
  const [rec, setRec] = useState<Recording>(initial);
  const [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const actionsEnd = useRef<HTMLLIElement>(null);
  const speechEnd = useRef<HTMLLIElement>(null);
  const closed = useRef(onClosed);
  closed.current = onClosed;

  useEffect(() => {
    if (narrator) narrator.events.onLevel = setLevel;
  }, [narrator]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      setNow(Date.now());
      try {
        const r = await api.recording(initial.id);
        if (!alive) return;
        setRec(r);
        if (r.status === 'done' || r.status === 'discarded') { closed.current(); return; }
      } catch { /* runtime restarting */ }
      if (alive) setTimeout(tick, 1000);
    };
    void tick();
    return () => { alive = false; };
  }, [initial.id]);

  useEffect(() => { actionsEnd.current?.scrollIntoView({ block: 'nearest' }); }, [rec.actions.length]);
  useEffect(() => { speechEnd.current?.scrollIntoView({ block: 'nearest' }); }, [rec.narration.length]);

  const finish = async (discard: boolean) => {
    await narrator?.stop();
    setRec(await api.stopRecording(rec.id, discard));
    if (discard) closed.current();
  };
  const toggleMic = () => { narrator?.setMuted(!muted); setMuted(!muted); };
  const recording = rec.status === 'recording';
  const elapsed = (rec.finishedAt ? Date.parse(rec.finishedAt) : now) - Date.parse(rec.startedAt);
  const pending = rec.narration.filter((n) => n.status === 'pending').length;

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
            <button type="button" className="btn small" onClick={() => finish(true)}>Descartar</button>
            <button type="button" className="btn small primary" onClick={() => finish(false)}>Terminar e aprender</button>
          </>
        )}
      </header>
      <div className="demo-cols">
        <div>
          <h3><GlobeIcon size={12} /> O que você fez <span className="muted">{rec.actions.length}</span></h3>
          <ol className="demo-list">
            {rec.actions.length === 0 && <li className="muted">Use o Chrome que abriu: cada clique e campo preenchido aparece aqui.</li>}
            {rec.actions.map((a, i) => (
              <li key={i} ref={i === rec.actions.length - 1 ? actionsEnd : undefined} className={`act ${a.kind}`}>
                <span className="mono muted">{mmss(a.t)}</span>
                <span>{a.secret ? <><KeyIcon size={11} /> {a.text.replace(/ \(credencial guardada no cofre\)/, '')}</> : a.text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3><MicIcon size={12} /> O que você explicou {pending > 0 && <span className="spinner" />}</h3>
          <ol className="demo-list">
            {!rec.narrated && <li className="muted">Sem narração nesta gravação.</li>}
            {rec.narrated && rec.narration.length === 0 && <li className="muted">Fale normalmente; os trechos aparecem a cada pausa.</li>}
            {rec.narration.map((n, i) => (
              <li key={i} ref={i === rec.narration.length - 1 ? speechEnd : undefined} className={`speech is-${n.status}`}>
                <span className="mono muted">{mmss(n.t)}</span>
                <span>{n.status === 'pending' ? 'transcrevendo…' : n.status === 'error' ? `não transcrito: ${n.error}` : `“${n.text}”`}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {rec.secrets.length > 0 && (
        <p className="muted small demo-secrets"><KeyIcon size={12} /> No cofre: {rec.secrets.join(', ')}</p>
      )}
    </section>
  );
}

/** The demonstration as it appears in the transcript (the message sent to the agent). */
export function DemonstrationCard({ text }: { text: string }) {
  const head = text.match(/<demonstracao[^>]*duracao="([^"]*)"[^>]*acoes="(\d+)"[^>]*falas="(\d+)"/);
  const body = text.match(/<demonstracao[^>]*>\n([\s\S]*?)\n<\/demonstracao>/)?.[1] ?? '';
  const lines = body.split('\n').map((l) => l.match(/^\[(\d\d:\d\d)\] (AÇÃO|FALA) {2}(.*)$/)).filter(Boolean) as RegExpMatchArray[];
  const [open, setOpen] = useState(false);
  return (
    <div className="msg user">
      <section className="demo-card">
        <header className="row gap">
          <span className="ui-icon rec"><RecordIcon size={13} /></span>
          <strong>Demonstração no navegador</strong>
        </header>
        <p className="muted small">{head ? `${head[2]} ações · ${head[3]} trechos de fala · ${head[1]}` : ''}</p>
        <button type="button" className="link-btn small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Esconder linha do tempo' : 'Ver linha do tempo'}</button>
        {open && (
          <ol className="demo-list timeline">
            {lines.map((m, i) => (
              <li key={i} className={m[2] === 'FALA' ? 'speech is-done' : 'act'}>
                <span className="mono muted">{m[1]}</span>
                <span>{m[2] === 'FALA' ? m[3] : m[3].replace(/\s+\{[^}]*\}$/, '')}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
