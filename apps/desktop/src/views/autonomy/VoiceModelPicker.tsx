import { useState } from 'react';
import { api, type VoiceStatus } from '../../api';

/** Which Whisper model: the known ones, or any other from onnx-community with the same files. */
export function VoiceModelPicker({ v }: { v: VoiceStatus }) {
  const [other, setOther] = useState('');
  const [error, setError] = useState<string>();
  const choose = async (model: string | null) => {
    setError(undefined);
    try {
      await api.chooseVoiceModel(model);
      setOther('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const known = v.known.some((k) => k.id === v.model);
  return (
    <div className="auto-row voice-model">
      <fieldset>
        <legend><strong>Modelo</strong></legend>
        {v.known.map((k) => (
          <label key={k.id} className="small">
            <input type="radio" name="voice-model" checked={v.model === k.id} onChange={() => void choose(k.id === v.defaultModel ? null : k.id)} />{' '}
            <code>{k.id}</code> <span className="muted">{k.size} · {k.note}</span>
          </label>
        ))}
        {!known && <p className="small">Em uso: <code>{v.model}</code> <button type="button" className="link-btn" onClick={() => void choose(null)}>voltar ao padrão</button></p>}
        <form className="row gap8" onSubmit={(e) => { e.preventDefault(); if (other.trim()) void choose(other.trim()); }}>
          <label htmlFor="voice-other" className="small muted">Outro</label>
          <input id="voice-other" value={other} onChange={(e) => setOther(e.target.value)} placeholder="dono/modelo" />
          <button type="submit" className="btn small" disabled={!other.trim()}>Usar</button>
        </form>
        {error && <p className="small err-text" role="alert">{error}</p>}
      </fieldset>
    </div>
  );
}
