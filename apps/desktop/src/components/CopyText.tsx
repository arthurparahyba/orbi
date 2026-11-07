import { useState } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

/** Copies a text to the clipboard and confirms for a moment. */
export function CopyText({ text, label, title }: { text: string; label: string; title?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1800);
  };
  return (
    <button type="button" className="btn small" onClick={copy} title={title}>
      {state === 'copied' ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      <span aria-live="polite">{state === 'copied' ? 'Copiado' : state === 'failed' ? 'Não deu para copiar' : label}</span>
    </button>
  );
}
