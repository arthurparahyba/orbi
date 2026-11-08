import { api, type VoiceStatus } from '../../api';
import { useLive } from '../../hooks';
import { CopyText } from '../../components/CopyText';
import { VoiceFiles } from './VoiceFiles';
import { VoiceModelPicker } from './VoiceModelPicker';

/**
 * Transcrição de voz: which model, where its files are, what is missing,
 * download with progress, or fetch the files by hand and drop them in the folder.
 */
export function Voice() {
  const voice = useLive(api.voice, ['voice']);
  const v = voice.data;
  return (
    <section className="auto-list" aria-labelledby="voice-title">
      <h2 id="voice-title">Transcrição de voz</h2>
      <p className="muted small pad-x16">
        Transforma a sua fala em texto no microfone da conversa e na narração das demonstrações.
        Roda nesta máquina: o áudio não sai daqui. O modelo é baixado uma vez e fica na pasta abaixo.
      </p>
      {!v && <div className="auto-row muted">{voice.error ? `Erro: ${voice.error}` : 'Carregando…'}</div>}
      {v?.backend === 'off' && <div className="auto-row muted">Desligada (<code>ORBI_STT=off</code> no .env).</div>}
      {v?.backend === 'http' && <div className="auto-row">Usa um serviço externo: <code>{v.url}</code>. O áudio sai desta máquina para esse endereço.</div>}
      {v?.backend === 'local' && (
        <>
          <div className="auto-row">
            <div>
              <strong>{statusLine(v)}</strong>
              {v.status.state === 'error' && <p className="small err-text">{v.status.message}</p>}
            </div>
            <button type="button" className="btn small primary" disabled={v.status.state === 'downloading'} onClick={() => void api.prepareVoice()}>
              {v.complete ? 'Testar' : 'Baixar agora'}
            </button>
          </div>
          <VoiceModelPicker v={v} />
          <div className="auto-row">
            <div className="voice-dir">
              <strong>Pasta do modelo</strong>
              <p className="small"><code>{v.dir}</code></p>
            </div>
            <CopyText text={v.dir} label="Copiar caminho" />
          </div>
          <VoiceFiles v={v} />
        </>
      )}
    </section>
  );
}

function statusLine(v: VoiceStatus): string {
  const s = v.status;
  if (s.state === 'downloading') return s.file ? `Baixando ${s.file}… ${s.progress ?? 0}%` : 'Carregando o modelo…';
  if (s.state === 'ready') return 'Pronta: o modelo carregou e transcreveu um teste.';
  if (s.state === 'error') return 'O modelo não ficou pronto.';
  return v.complete ? 'Modelo na pasta. Clique em Testar para conferir.' : 'Modelo ainda não baixado. Baixa sozinho no primeiro uso, ou agora.';
}
