import { useRef, useState } from 'react';
import { MicIcon, SendIcon, StopIcon } from '../Icons';
import { appendDictation, micAvailability } from '../dictation';
import { useDictation } from '../useDictation';
import { api } from '../../api';
import { useLive } from '../../hooks';

/**
 * The message box: Enter sends, Shift+Enter breaks the line. The microphone dictates into the
 * box (it does not send): speak, Enter (or the microphone) stops and transcribes, Enter again
 * sends. While the Orbi works, the stop button interrupts the turn.
 */
export function Composer({ onSend, placeholder = 'Peça algo ou ensine um procedimento…', busy = false, onStop }: {
  onSend(text: string): Promise<void>;
  placeholder?: string;
  busy?: boolean;
  onStop?(): void;
}) {
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation((text) => setDraft((d) => appendDictation(d, text)));
  const listening = dictation.state === 'listening';
  const working = dictation.state === 'transcribing';
  // The local model loads into memory after the app opens: the microphone waits for it, and says so.
  const voice = useLive(api.voice, ['voice']);
  const mic = micAvailability(voice.data);

  const startDictation = () => {
    void dictation.start();
    // Keep the keyboard in the box, so Enter stops the dictation (and the next Enter sends).
    box.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (listening) void dictation.stop();
    else if (!working) submit();
  };

  const submit = () => {
    if (!draft.trim() || dictation.state !== 'idle') return;
    const text = draft;
    setDraft('');
    void onSend(text);
  };

  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="composer-box">
        <label htmlFor="composer" className="sr-only">Mensagem para o Orbi</label>
        <textarea
          id="composer"
          ref={box}
          rows={2}
          value={draft}
          placeholder={listening ? 'Pode falar… Enter (ou o microfone) termina e transcreve.' : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        {!listening && !working && !dictation.error && !mic.ready && <p className="composer-note small muted" role="status">{mic.why}</p>}
        {(listening || working || dictation.error) && (
          <p className={`composer-note small ${dictation.error ? 'err-text' : 'muted'}`} role="status">
            {dictation.error
              ? <>Não transcrevi: {dictation.error} <button type="button" className="link-btn" onClick={dictation.clearError}>ok</button></>
              : listening ? 'Ouvindo. Enter termina e transcreve; Enter de novo envia.' : 'Transcrevendo o final…'}
          </p>
        )}
      </div>
      <button
        type="button"
        className={`btn icon-only mic-btn ${listening ? 'on' : ''}`}
        onClick={() => (listening ? void dictation.stop().then(() => box.current?.focus()) : startDictation())}
        disabled={working || (!listening && !mic.ready)}
        aria-pressed={listening}
        aria-label={listening ? 'Parar de ditar' : mic.ready ? 'Ditar mensagem' : mic.why}
        title={listening ? 'Parar de ditar' : mic.ready ? 'Ditar: fale e o texto entra na caixa' : mic.why}
      >
        {working || (!listening && !mic.ready) ? <span className="spinner" aria-hidden="true" /> : <MicIcon size={16} />}
        {listening && <span className="mic-level" style={{ transform: `scaleX(${dictation.level})` }} aria-hidden="true" />}
      </button>
      {busy && onStop && !draft.trim() ? (
        <button type="button" className="btn icon-only stop-btn" onClick={onStop} aria-label="Parar" title="Parar o que o Orbi está fazendo"><StopIcon size={14} /></button>
      ) : (
        <button type="submit" className="btn primary icon-only" disabled={!draft.trim() || dictation.state !== 'idle'} aria-label="Enviar"><SendIcon size={16} /></button>
      )}
    </form>
  );
}
