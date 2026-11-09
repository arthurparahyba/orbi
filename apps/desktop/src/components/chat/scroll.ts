/** How close to the bottom still counts as "following the conversation". */
export const NEAR_BOTTOM_PX = 80;

export function isNearBottom(el: { scrollTop: number; scrollHeight: number; clientHeight: number }, px = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= px;
}

/**
 * What changes only when there is something new to read: how many messages and how long
 * the last one is. A refresh that brings the same messages keeps the same key.
 */
export function contentKey(messages: ReadonlyArray<{ id: string; parts?: unknown }>): string {
  const last = messages.at(-1);
  return `${messages.length}:${last?.id ?? ''}:${last ? JSON.stringify(last.parts ?? '').length : 0}`;
}
