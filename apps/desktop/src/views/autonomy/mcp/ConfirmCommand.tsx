/**
 * Before a program runs for the first time (or after it changed): it runs on this machine with
 * your user, so you confirm that you trust it (docs/funcionalidades/20).
 */
export function ConfirmCommand({ line, busy, onRun, onCancel, action = 'Rodar e testar' }: { line: string; busy?: boolean; onRun(): void; onCancel?(): void; action?: string }) {
  return (
    <div className="note-warn mcp-confirm" role="alertdialog" aria-label="Confirmar comando">
      <p className="small"><strong>Este comando vai rodar nesta máquina, com o seu usuário:</strong></p>
      <code className="block">{line}</code>
      <p className="muted small">Só continue se você confia neste programa. O Orbi não instala nada sozinho; se o comando mudar, ele pergunta de novo.</p>
      <div className="row">
        <button type="button" className="btn small primary" disabled={busy} onClick={onRun}>{busy ? 'Rodando…' : action}</button>
        {onCancel && <button type="button" className="btn small" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}
