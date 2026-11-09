import { useState } from 'react';
import { MicIcon, SendIcon } from '../Icons';
import { appendDictation } from '../dictation';
import { useDictation } from '../useDictation';

/**
 * The message box: Enter sends, Shift+Enter breaks the line. The microphone
 * dictates into the box (it does not send): speak, stop, read, send.
 */
export function Composer({ onSend }: { onSend(text: string): Promise<void> }) {
  const [draft, setDraft] = useState('');
  const dictation = useDictation((text) => setDraft((d) => appendDictation(d, text)));
  const listening = dictation.state === 'listening';
  const working = dictation.state === 'transcribing';

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
          rows={2}
          value={draft}
          placeholder={listening ? 'Pode falar… clique no microfone de novo para terminar.' : 'Peça algo ou ensine um procedimento…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        {(listening || working || dictation.error) && (
          <p className={`composer-note small ${dictation.error ? 'err-text' : 'muted'}`} role="status">
            {dictation.error
              ? <>Não transcrevi: {dictation.error} <button type="button" className="link-btn" onClick={dictation.clearError}>ok</button></>
              : listening ? 'Ouvindo. O texto aparece aqui a cada pausa; nada é enviado sem você.' : 'Transcrevendo o final…'}
          </p>
        )}
      </div>
      <button
        type="button"
        className={`btn icon-only mic-btn ${listening ? 'on' : ''}`}
        onClick={() => void (listening ? dictation.stop() : dictation.start())}
        disabled={working}
        aria-pressed={listening}
        aria-label={listening ? 'Parar de ditar' : 'Ditar mensagem'}
        title={listening ? 'Parar de ditar' : 'Ditar: fale e o texto entra na caixa'}
      >
        {working ? <span className="spinner" aria-hidden="true" /> : <MicIcon size={16} />}
        {listening && <span className="mic-level" style={{ transform: `scaleX(${dictation.level})` }} aria-hidden="true" />}
      </button>
      <button type="submit" className="btn primary icon-only" disabled={!draft.trim() || dictation.state !== 'idle'} aria-label="Enviar"><SendIcon size={16} /></button>
    </form>
  );
}
