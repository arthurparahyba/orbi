import { useState } from 'react';
import { api, type LogLine } from '../../api';
import { useLive } from '../../hooks';

/**
 * O registro do runtime (documento 29). Ele sempre existiu num arquivo e ninguém o enxergava:
 * quando o Orbi falhava, a aplicação mostrava um círculo girando e a resposta estava escrita
 * num `.log`.
 *
 * A tela não fica perguntando: aviso e erro chegam pelo feed (tópico `log`), e o resto espera o
 * botão. É a convenção do app, e aqui ela também é a mais útil — um turno do modelo escreve
 * dezenas de linhas `info` e a tela piscaria sem parar.
 */
const LEVELS = [
  { id: '', label: 'Tudo' },
  { id: 'info', label: 'Info e acima' },
  { id: 'warn', label: 'Avisos e erros' },
  { id: 'error', label: 'Só erros' },
] as const;

export function Logs() {
  const [level, setLevel] = useState('');
  const [text, setText] = useState('');
  const log = useLive(() => api.logs({ level: level || undefined, text: text || undefined }), ['log'], [level, text]);

  return (
    <div className="logs">
      <div className="logs-bar">
        <label className="logs-field">
          <span className="muted small">Nível</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label className="logs-field logs-search">
          <span className="muted small">Procurar</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="plugin, modelo, mcp…" />
        </label>
        <button type="button" className="btn small" onClick={() => void log.reload()}>Atualizar</button>
      </div>

      {log.error ? (
        <Unavailable error={log.error} />
      ) : !log.data ? (
        <p className="muted pad">Carregando…</p>
      ) : log.data.lines.length === 0 ? (
        <p className="muted pad">Nada no registro com esse filtro.</p>
      ) : (
        <>
          <ol className="log-lines">
            {log.data.lines.map((line, i) => <Line key={`${line.at ?? ''}-${i}`} line={line} />)}
          </ol>
          <footer className="logs-foot muted small">
            <span>{log.data.lines.length} linhas{log.data.raw > 0 && `, ${log.data.raw} que o Orbi não reconhece`}</span>
            <code>{log.data.file}</code>
          </footer>
        </>
      )}
    </div>
  );
}

/**
 * Sem arquivo não é defeito: com `npm start` a saída vai para o terminal. Dizer isso é melhor do
 * que mostrar "erro 409" a quem está procurando a causa de outra coisa.
 */
function Unavailable({ error }: { error: string }) {
  const noFile = /sem-arquivo/.test(error);
  return (
    <div className="agents-empty">
      <p>{noFile ? 'Não há arquivo de registro nesta forma de rodar.' : 'Não deu para ler o registro.'}</p>
      <p className="muted small">
        {noFile
          ? 'O runtime escreve na saída padrão, e é o aplicativo empacotado que a guarda em arquivo. Rodando pelo terminal, o registro está no terminal.'
          : error}
      </p>
    </div>
  );
}

function Line({ line }: { line: LogLine }) {
  const attrs = Object.entries(line.attrs);
  return (
    <li className={`log-line ${line.level ?? 'raw'}`}>
      <time className="log-at">{hour(line.at)}</time>
      <span className="log-level">{line.kind === 'raw' ? '—' : line.level}</span>
      <span className="log-msg">
        {line.msg}
        {attrs.length > 0 && (
          <span className="log-attrs">
            {attrs.map(([k, v]) => <span key={k}><b>{k}</b>={typeof v === 'string' ? v : JSON.stringify(v)}</span>)}
          </span>
        )}
      </span>
    </li>
  );
}

/** Só a hora: a lista é do fim do arquivo, e a data inteira em cada linha só atrapalha. */
export function hour(at: string | null): string {
  if (!at) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(at)) return at;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour12: false });
}
