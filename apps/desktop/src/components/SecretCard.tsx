import { useContext, useState } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { api } from '../api';
import { useLive } from '../hooks';
import { KeyIcon } from './Icons';
import { InboxContext } from './UiComponents';
import { secretNameProblem, toSecretName } from '../views/autonomy/format';

/**
 * Orbi needs a credential. The value is typed here and saved straight to the
 * vault: it is not a chat message and never reaches the model. Orbi only
 * learns that {{segredo:nome}} now exists.
 */
export function SecretCard({ c }: { c: Extract<UiComponent, { component: 'secret' }> }) {
  const item = useContext(InboxContext).items.get(c.inboxId);
  const vault = useLive(api.vault, ['vault']);
  const [name, setName] = useState(c.name);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const exists = vault.data?.secrets.some((s) => s.name === name);
  const problem = name && !exists ? secretNameProblem(name, []) : undefined;

  const save = async (useExisting = false) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.provideSecret(c.inboxId, { name, ...(useExisting ? {} : { value }), description: c.description || undefined });
      setValue('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <section className={`ui-card secret ${item && item.status !== 'open' ? 'is-answered' : ''}`}>
      <header className="ui-card-head"><KeyIcon size={14} /><span className="ui-kicker">O Orbi precisa de uma credencial</span></header>
      <p className="ui-title">{c.description || c.name}</p>
      {c.reason && <p className="muted small">{c.reason}</p>}
      {item && item.status !== 'open' ? (
        <p className="decided answered">Guardada no cofre como <code>{item.answer ?? `{{segredo:${name}}}`}</code></p>
      ) : (
        <form className="secret-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label>Nome no cofre
            <input value={name} onChange={(e) => setName(toSecretName(e.target.value))} autoComplete="off" />
          </label>
          <label>Valor
            <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="new-password" placeholder={exists ? 'deixe vazio para usar o que já está no cofre' : ''} />
          </label>
          <div className="row gap8">
            <button type="submit" className="btn primary small" disabled={busy || !name || !value || !!problem}>Guardar no cofre</button>
            {exists && <button type="button" className="btn small" disabled={busy} onClick={() => void save(true)}>Usar a que já está no cofre</button>}
          </div>
          <p className="muted small">{problem ?? 'Vai direto para o cofre. Não entra na conversa e o Orbi não vê o valor.'}</p>
          {error && <p className="banner small" role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
