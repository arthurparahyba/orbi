import { useState } from 'react';
import { TrashIcon } from './Icons';

/**
 * Asks before deleting, in place (no browser dialog), and says what goes with
 * it. Shows the runtime's error if the delete fails.
 */
export function ConfirmDelete({ what, consequences, onConfirm, onCancel }: {
  what: string;
  consequences: string[];
  onConfirm(): Promise<void>;
  onCancel(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <div className="confirm-delete" role="alertdialog" aria-label={`Apagar ${what}`}>
      <p><strong>Apagar {what}?</strong> Não dá para desfazer.</p>
      {consequences.length > 0 && <ul>{consequences.map((c) => <li key={c}>{c}</li>)}</ul>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn danger" disabled={busy} onClick={confirm}><TrashIcon size={14} /> Apagar</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
