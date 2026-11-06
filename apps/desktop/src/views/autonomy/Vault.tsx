import { useState } from 'react';
import { api, type SecretInfo } from '../../api';
import { useLive } from '../../hooks';

/** Credentials: names and where they came from; values only go in, never out. */
export function Vault() {
  const vault = useLive(api.vault, ['vault']);
  const [editing, setEditing] = useState<string>();
  const [value, setValue] = useState('');
  const save = async (name: string) => { await api.setSecret(name, value); setEditing(undefined); setValue(''); await vault.reload(); };
  const remove = async (s: SecretInfo) => { await api.deleteSecret(s.name); await vault.reload(); };
  return (
    <section className="auto-list">
      <h2>Cofre de credenciais</h2>
      <p className="muted small pad-x16">
        {vault.data?.backend === 'keychain'
          ? 'Guardadas no cofre do sistema (Keychain no macOS). '
          : 'Guardadas num arquivo criptografado (AES-256) na pasta de dados. '}
        Os playbooks só têm a referência; o valor é usado dentro da ação do navegador e nunca chega ao modelo nem ao cérebro.
      </p>
      {vault.data?.secrets.length === 0 && <div className="auto-row muted">Nenhuma credencial ainda. Elas entram aqui quando você digita uma senha durante uma demonstração.</div>}
      {vault.data?.secrets.map((s) => (
        <div key={s.name} className="auto-row vault-row">
          <div>
            <strong>{s.description || s.name}</strong>
            <p className="muted small"><code>{`{{segredo:${s.name}}}`}</code> · {s.origin}</p>
          </div>
          {editing === s.name ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); void save(s.name); }}>
              <label className="sr-only" htmlFor={`v-${s.name}`}>Novo valor</label>
              <input id={`v-${s.name}`} type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="off" />
              <button type="submit" className="btn small primary" disabled={!value}>Salvar</button>
              <button type="button" className="btn small" onClick={() => setEditing(undefined)}>Cancelar</button>
            </form>
          ) : (
            <div className="row">
              <button type="button" className="btn small" onClick={() => { setEditing(s.name); setValue(''); }}>Trocar valor</button>
              <button type="button" className="btn small" onClick={() => remove(s)}>Remover</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
