import { useState } from 'react';
import { api } from '../../api';
import { CopyText } from '../../components/CopyText';
import { secretNameProblem, toSecretName } from './format';

/**
 * A new credential typed by the developer (e.g. the GitHub password before
 * teaching Orbi to log in). The value goes straight to the vault; what Orbi
 * and the procedures see is only the reference {{segredo:nome}}.
 */
export function AddSecret({ taken, onAdded }: { taken: string[]; onAdded(): void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<string>();
  const problem = name ? secretNameProblem(name, taken) : undefined;

  const save = async () => {
    setError(undefined);
    try {
      await api.setSecret(name, value, description.trim() || undefined);
      setAdded(name);
      setName(''); setDescription(''); setValue(''); setOpen(false);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!open) {
    return (
      <div className="auto-row">
        <span className="small">
          {added
            ? <>Guardada. No procedimento, use <code>{`{{segredo:${added}}}`}</code> <CopyText text={`{{segredo:${added}}}`} label="Copiar referência" /></>
            : <span className="muted">Senha, token ou chave que o Orbi vai precisar para entrar num site ou sistema.</span>}
        </span>
        <button type="button" className="btn small primary" onClick={() => { setOpen(true); setAdded(undefined); }}>Adicionar credencial</button>
      </div>
    );
  }
  return (
    <form className="auto-row add-secret" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="add-secret-fields">
        <label>Nome
          <input value={name} onChange={(e) => setName(toSecretName(e.target.value))} placeholder="github/senha" autoFocus autoComplete="off" aria-describedby="secret-name-hint" />
        </label>
        <label><span>Descrição <span className="muted">(opcional)</span></span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Senha do GitHub (usuário arthur)" autoComplete="off" />
        </label>
        <label>Valor
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="new-password" />
        </label>
        <p id="secret-name-hint" className={`small ${problem ? 'err-text' : 'muted'}`}>
          {problem ?? (name ? <>O Orbi vai usar <code>{`{{segredo:${name}}}`}</code>. O valor nunca aparece para ele.</> : 'Letras minúsculas, números e . _ / @ -')}
        </p>
        {error && <p className="banner small" role="alert">{error}</p>}
      </div>
      <div className="row gap8">
        <button type="submit" className="btn small primary" disabled={!name || !value || !!problem}>Guardar no cofre</button>
        <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}
