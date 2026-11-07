import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Narrator } from '../audio';

export type DictationState = 'idle' | 'listening' | 'transcribing';

/**
 * Speak instead of typing: the microphone is cut at pauses (same capture as
 * the demonstrations), each piece is transcribed by the runtime and handed to
 * `onText` in order. Nothing is sent: the text lands in the box for review.
 */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string>();
  const narrator = useRef<Narrator | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const textRef = useRef(onText);
  textRef.current = onText;

  const transcribe = (wav: Blob) => {
    // In order: a later piece waits for the earlier one, so the words keep their order.
    queue.current = queue.current.then(async () => {
      try {
        const text = await api.transcribe(wav);
        if (text) textRef.current(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const start = useCallback(async () => {
    setError(undefined);
    const n = new Narrator({ onSegment: (_t, _d, wav) => transcribe(wav), onLevel: setLevel });
    try {
      await n.start();
    } catch {
      setError('Não consegui usar o microfone. Confira a permissão do app nas configurações do sistema.');
      return;
    }
    narrator.current = n;
    setState('listening');
  }, []);

  const stop = useCallback(async () => {
    const n = narrator.current;
    narrator.current = undefined;
    if (!n) return;
    setState('transcribing');
    setLevel(0);
    await n.stop(); // flushes what was said since the last pause
    await queue.current;
    setState('idle');
  }, []);

  useEffect(() => () => { void narrator.current?.stop(); }, []);
  return { state, level, error, start, stop, clearError: () => setError(undefined) };
}
