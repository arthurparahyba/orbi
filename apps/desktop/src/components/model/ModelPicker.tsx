import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { CheckIcon, DownIcon } from '../Icons';
import { TIER_HINT, byTier, pickerLabel } from './tiers';

/**
 * Under the message box: which model this conversation thinks with. Starts at the default;
 * the list is the active provider's, by cost (barato, intermediário, caro). The choice holds
 * for this conversation only, from the next message.
 */
export function ModelPicker({ conversationId, chosen, onChosen }: { conversationId: string; chosen?: string; onChosen(): void }) {
  const choices = useLoad(api.modelChoices);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const c = choices.data;
  const now = pickerLabel(c, chosen);
  const pick = async (model: string) => {
    setOpen(false);
    await api.setConversationModel(conversationId, model === c?.default ? null : model);
    onChosen();
  };
  if (c && c.models.length < 2) return <span className="model-chip static" title="O provedor em uso oferece um modelo só">{now.model}{now.tier ? ` · ${now.tier}` : ''}</span>;
  return (
    <div className="model-picker" ref={ref}>
      <button type="button" className="model-chip" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title="Com qual modelo o Orbi pensa nesta conversa">
        <span className="mono">{now.model}</span>
        {now.tier && <span className={`tier tier-${c?.models.find((m) => m.id === now.model)?.tier}`}>{now.tier}</span>}
        {now.isDefault && <span className="muted">padrão</span>}
        <DownIcon size={12} />
      </button>
      {open && c && (
        <div className="model-menu" role="listbox" aria-label="Modelos">
          {byTier(c.models).map((g) => (
            <div key={g.key} className="model-group">
              <p className="model-group-title">{g.title}{g.key !== 'none' && <span className="muted"> · {TIER_HINT[g.key]}</span>}</p>
              {g.models.map((m) => (
                <button key={m.id} type="button" role="option" aria-selected={m.id === now.model} className={m.id === now.model ? 'on' : ''} onClick={() => void pick(m.id)}>
                  <span className="mono">{m.id}</span>
                  {m.id === c.default && <span className="muted">padrão</span>}
                  {m.id === now.model && <CheckIcon size={13} />}
                </button>
              ))}
            </div>
          ))}
          <p className="model-menu-note muted">Vale só para esta conversa, a partir da próxima mensagem. A categoria de cada modelo se ajusta em Autonomia → Modelo.</p>
        </div>
      )}
    </div>
  );
}
