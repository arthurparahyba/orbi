/** Joins dictated text to what is already in the box: one space between, nothing doubled. */
export function appendDictation(draft: string, text: string): string {
  const t = text.trim();
  if (!t) return draft;
  if (!draft.trim()) return t;
  return /\s$/.test(draft) ? `${draft}${t}` : `${draft} ${t}`;
}
