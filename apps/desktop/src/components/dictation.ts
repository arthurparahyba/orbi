/** Joins dictated text to what is already in the box: one space between, nothing doubled. */
export function appendDictation(draft: string, text: string): string {
  const t = text.trim();
  if (!t) return draft;
  if (!draft.trim()) return t;
  return /\s$/.test(draft) ? `${draft}${t}` : `${draft} ${t}`;
}

/** What the microphone can do now, from the transcription model's state (GET /api/voice). */
export interface MicAvailability { ready: boolean; why?: string }

export function micAvailability(voice: { backend: string; status: { state: string; progress?: number } } | undefined): MicAvailability {
  if (!voice || voice.backend !== 'local') return { ready: true };
  if (voice.status.state === 'loading') return { ready: false, why: 'Carregando o modelo de voz… (só depois de abrir o Orbi)' };
  if (voice.status.state === 'downloading') {
    const pct = voice.status.progress !== undefined ? ` ${Math.round(voice.status.progress)}%` : '';
    return { ready: false, why: `Baixando o modelo de voz${pct}…` };
  }
  return { ready: true };
}
