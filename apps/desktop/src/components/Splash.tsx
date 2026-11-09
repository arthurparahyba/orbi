import { useEffect, useState } from 'react';
import { OrbiIcon } from './Icons';

/** Waited this long without an answer, the splash says where to look. */
const HINT_AFTER_MS = 15_000;

/** The app is ready to show once the runtime answered and the first data is in. */
export function booted(first: { health?: unknown; inbox?: unknown }): boolean {
  return first.health !== undefined && first.inbox !== undefined;
}

/** The first moments: the runtime may still be starting (the app starts it). */
export function Splash({ error }: { error?: string }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), HINT_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="splash" role="status" aria-live="polite">
      <span className="splash-mark"><OrbiIcon size={34} /></span>
      <p>{error ? 'Iniciando o Orbi…' : 'Carregando…'}</p>
      {late && error && (
        <p className="muted small splash-hint">
          O runtime ainda não respondeu em 127.0.0.1:3000. Veja o log em <code>~/Library/Application Support/br.com.zup.orbi/logs/runtime.log</code>
          {' '}(no desenvolvimento, rode <code>npm run demo</code> ou <code>npm start</code> na raiz).
        </p>
      )}
    </div>
  );
}
