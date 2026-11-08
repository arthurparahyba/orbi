import type { VoiceStatus } from '../../api';
import { CopyText } from '../../components/CopyText';

/**
 * The files the model needs, with a link to each: when the download fails
 * (a company proxy, for instance), fetch them in the browser and save them in
 * the folder above, keeping the onnx/ subfolder. Then click Testar.
 */
export function VoiceFiles({ v }: { v: VoiceStatus }) {
  const missing = v.files.filter((f) => !f.present).length;
  return (
    <details className="auto-row voice-files" open={v.status.state === 'error' || undefined}>
      <summary>
        <strong>Baixar à mão</strong>{' '}
        <span className="muted small">{missing ? `faltam ${missing} de ${v.files.length} arquivos` : 'todos os arquivos estão na pasta'}</span>
      </summary>
      <p className="small">
        Se o download não funcionar aqui, abra cada link no navegador e salve o arquivo na pasta do modelo, com o mesmo nome e
        dentro da subpasta <code>onnx/</code> quando o caminho tiver. Depois clique em <strong>Testar</strong>. Outro computador
        que já tenha o modelo também serve: copie a pasta inteira.
      </p>
      <ul className="voice-file-list">
        {v.files.map((f) => (
          <li key={f.path}>
            <span aria-label={f.present ? 'na pasta' : 'faltando'} className={f.present ? 'ok-text' : 'err-text'}>{f.present ? '✓' : '✗'}</span>{' '}
            <a href={f.url} target="_blank" rel="noreferrer"><code>{f.path}</code></a>
            {f.present && <span className="muted small"> · {(f.bytes / 1e6).toFixed(f.bytes > 1e6 ? 0 : 2)} MB</span>}
          </li>
        ))}
      </ul>
      <CopyText text={v.files.map((f) => `${f.url}  →  ${f.path}`).join('\n')} label="Copiar todos os links" title="Para abrir no navegador (no app, os links podem não abrir)" />
      {v.offline && <p className="muted small">Modo sem internet (<code>ORBI_STT_OFFLINE=true</code>): o Orbi só usa o que está na pasta.</p>}
    </details>
  );
}
