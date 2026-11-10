import { useEffect, useRef, useState } from 'react';
import { CopyIcon, MoreIcon, TrashIcon } from '../../components/Icons';

/** The "…" of the conversation: what is used now and then (copy it, delete it). */
export function ChatMenu({ canCopy, copy, onDelete }: { canCopy: boolean; copy(): string; onDelete(): void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const doCopy = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(copy());
      setNote('Conversa copiada');
    } catch {
      setNote('Não deu para copiar');
    }
    setTimeout(() => setNote(undefined), 1800);
  };

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Mais" aria-label="Mais ações da conversa"><MoreIcon size={16} /></button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={doCopy} disabled={!canCopy} title="Mensagens, ferramentas, cartões e erros, em Markdown"><CopyIcon size={14} /> Copiar conversa</button>
          <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}><TrashIcon size={14} /> Apagar conversa</button>
        </div>
      )}
      <span className="menu-note" aria-live="polite">{note}</span>
    </div>
  );
}
