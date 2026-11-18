import { useEffect, useState } from 'react';
import { api, type ChromeSettings } from '../../../api';
import { useLoad } from '../../../hooks';
import { changed, formOf, requestOf, restartNote, urlHint, type ChromeForm } from './chromeForm';

/** Chrome DevTools: which browser, the window, starting with Orbi, profile and program (docs/funcionalidades/20). */
export function ChromeSettingsCard({ onSaved }: { onSaved(): void }) {
  const loaded = useLoad(api.browserSettings);
  const [form, setForm] = useState<ChromeForm>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (loaded.data) setForm(formOf(loaded.data)); }, [loaded.data]);
  const s = loaded.data;
  if (!s || !form) return <p className="muted small">{loaded.error ? `Erro: ${loaded.error}` : 'Carregando…'}</p>;
  const set = (p: Partial<ChromeForm>) => { setForm({ ...form, ...p }); setError(undefined); };
  const hint = urlHint(form);
  const save = async () => {
    setSaving(true);
    try {
      await api.setBrowserSettings(requestOf(form));
      await loaded.reload();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="chrome-settings" aria-labelledby="chrome-h">
      <h2 id="chrome-h">Chrome do gravador <span className="muted small">o navegador que o Orbi abre em “Mostrar no navegador”</span></h2>
      <fieldset className="chrome-which">
        <legend className="small muted">Qual navegador</legend>
        <WhichOption on={form.browser === 'proprio'} onPick={() => set({ browser: 'proprio' })} title="Perfil próprio do Orbi" text="Separado do seu Chrome. Os logins feitos nele ficam guardados entre execuções." />
        <WhichOption on={form.browser === 'seu'} onPick={() => set({ browser: 'seu' })} title="O seu Chrome" text="Usa as suas abas e logins. Abra o Chrome com --remote-debugging-port=9222 antes." />
      </fieldset>
      {form.browser === 'seu' && (
        <label className="field">Endereço da depuração<input value={form.browserUrl ?? ''} placeholder="http://127.0.0.1:9222" onChange={(e) => set({ browserUrl: e.target.value })} /></label>
      )}
      <div className="chrome-grid">
        <label className="check"><input type="checkbox" checked={form.showWindow} onChange={(e) => set({ showWindow: e.target.checked })} /> Mostrar a janela <span className="muted small">desligue para rodar sem janela</span></label>
        {form.browser === 'proprio' && <label className="field">Pasta do perfil<input value={form.profileDir ?? ''} onChange={(e) => set({ profileDir: e.target.value })} /></label>}
        <label className="field">Programa do Chrome <span className="muted small">{s.detected ? `achei: ${s.detected}` : s.detectError}</span>
          <input value={form.executablePath ?? ''} placeholder="em branco: o que achei" onChange={(e) => set({ executablePath: e.target.value })} />
        </label>
      </div>
      <p className="muted small">Depuração em 127.0.0.1:{s.debugPort}, que muda no .env. Para o navegador <em>dos procedimentos</em>, cadastre um servidor MCP acima e marque “é o navegador do Orbi”.</p>
      {(hint || error) && <p className="form-error" role="alert">{error ?? hint}</p>}
      {changed(s, form) && <p className="muted small">{restartNote(form)}</p>}
      <div className="row">
        <button type="button" className="btn small primary" disabled={!changed(s, form) || !!hint || saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar e reiniciar'}</button>
        {changed(s, form) && <button type="button" className="btn small" onClick={() => setForm(formOf(s))}>Desfazer</button>}
      </div>
    </section>
  );
}

function WhichOption({ on, onPick, title, text }: { on: boolean; onPick(): void; title: string; text: string }) {
  return (
    <label className={`model-option ${on ? 'active' : ''}`}>
      <input type="radio" name="chrome-which" checked={on} onChange={onPick} />
      <span className="model-option-body"><strong>{title}</strong><span className="muted small">{text}</span></span>
    </label>
  );
}
