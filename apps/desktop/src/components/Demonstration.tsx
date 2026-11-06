import { useState } from 'react';
import { api, type Recording } from '../api';
import { Narrator } from '../audio';
import { RecordIcon, XIcon } from './Icons';

export const mmss = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

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
        O Orbi abre um Chrome e anota cada passo que você fizer. Se quiser, explique em voz alta: a fala vira o porquê de cada passo.
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
