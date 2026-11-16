import { useEffect, useState } from 'react';
import type { Health, InboxItem } from '../api';

/** Esperou isto sem resposta e a tela deixa de esperar: passa a dizer o que fazer. */
const GIVE_UP_AFTER_MS = 20_000;
const LOG_PATH = '~/Library/Application Support/br.com.zup.orbi/logs/runtime.log';

/** A aplicação está pronta quando o runtime respondeu e o primeiro dado chegou. */
export function booted(first: { health?: unknown; inbox?: unknown }): boolean {
  return first.health !== undefined && first.inbox !== undefined;
}

/**
 * Os primeiros momentos: o runtime pode ainda estar subindo (é a aplicação que o sobe).
 *
 * Cada linha é estado de verdade, não encenação: o runtime respondeu ou não, o cérebro veio na
 * resposta dele, o modelo está pronto ou não, as conversas chegaram. Não há `setTimeout` marcando
 * passo nenhum — um progresso inventado numa tela de abertura é pior do que silêncio, porque
 * ensina a não confiar no que a tela diz.
 */
export function Splash({ error, health, inbox }: { error?: string; health?: Health; inbox?: InboxItem[] }) {
  const [gaveUp, setGaveUp] = useState(false);
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setWaited(Math.floor((Date.now() - started) / 1000)), 1000);
    const t = setTimeout(() => setGaveUp(true), GIVE_UP_AFTER_MS);
    return () => { clearInterval(tick); clearTimeout(t); };
  }, []);

  if (gaveUp && !health) return <NotAnswering waited={waited} />;

  return (
    <div className="splash" role="status" aria-live="polite">
      <Orbit size={200} />
      <h1 className="splash-name">Orbi</h1>
      <p className="splash-sub">{error ? 'Subindo o runtime na sua máquina' : 'Abrindo'}</p>

      <ul className="splash-steps">
        <Step done={!!health} label={<>Runtime em <code>127.0.0.1:3000</code></>} />
        <Step done={!!health} label={<>Cérebro{health && <span className="muted"> · {brainLine(health)}</span>}</>} />
        <Step done={health?.llmReady === true} label={<>Modelo{health?.llmReady === false ? <span className="muted"> · ainda não configurado</span> : null}</>} />
        <Step done={inbox !== undefined} label="Conversas" />
      </ul>

      <p className="splash-foot">
        {health?.build ? `${health.build} · ` : ''}tudo roda aqui, nada sai da máquina
      </p>
    </div>
  );
}

/** O cérebro em uma linha. Vazio não é falta: ele começa assim e aprende com o desenvolvedor. */
export function brainLine(health: Health): string {
  const { entities, domains } = health.brain;
  if (entities === 0) return 'vazio, aprende com você';
  const assuntos = domains === 0 ? '' : ` em ${domains} ${domains === 1 ? 'domínio' : 'domínios'}`;
  return `${entities} ${entities === 1 ? 'fato' : 'fatos'}${assuntos}`;
}

function Step({ done, label }: { done: boolean; label: React.ReactNode }) {
  return (
    <li className={done ? 'step done' : 'step'}>
      {done ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12l5 5 9-10" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="step-spin">
          <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="24 8" />
        </svg>
      )}
      <span>{label}</span>
    </li>
  );
}

/**
 * A marca do Orbi é uma órbita, e é ela que se move: o satélite percorre a mesma elipse que o
 * ícone desenha. `prefers-reduced-motion` para tudo, e o satélite fica parado onde o ícone o põe.
 */
function Orbit({ size }: { size: number }) {
  const r = size / 2;
  return (
    <div className="orbit" style={{ width: size, height: size }} role="img" aria-label="Orbi iniciando">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <ellipse cx={r} cy={r} rx={size * 0.4} ry={size * 0.15} transform={`rotate(24 ${r} ${r})`} fill="none" stroke="var(--border-2)" strokeWidth="1.5" />
        <circle className="orbit-core" cx={r} cy={r} r={size * 0.11} fill="var(--text)" />
      </svg>
      <span className="orbit-sat" aria-hidden="true" />
    </div>
  );
}

/** Não subiu. O que esta tela faz de melhor é dizer o que costuma resolver, na ordem. */
function NotAnswering({ waited }: { waited: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="splash splash-stuck" role="alert">
      <div className="stuck-head">
        <Orbit size={100} />
        <div>
          <h1>O runtime não respondeu</h1>
          <p className="muted">
            Esperando há {waited} segundos em <code>127.0.0.1:3000</code>. O Orbi continua tentando.
          </p>
        </div>
      </div>

      <div className="ui-card stuck-card">
        <h2>O que costuma resolver</h2>
        <ol>
          <li>Outro Orbi já aberto nesta máquina — feche o outro: a porta é uma só.</li>
          <li>No desenvolvimento, o runtime sobe à parte: <code>npm start</code> na raiz.</li>
          <li>O log diz o que falhou na última tentativa.</li>
        </ol>
      </div>

      <div className="stuck-actions">
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>Tentar de novo</button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(LOG_PATH);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Caminho copiado' : 'Copiar o caminho do log'}
        </button>
      </div>

      <p className="splash-foot stuck-path">{LOG_PATH}</p>
    </div>
  );
}
