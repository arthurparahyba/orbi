import * as v from 'valibot';

/**
 * The component catalog the desktop app knows how to draw. The agent never
 * sends HTML: it sends one of these shapes on the `ui` data channel and the
 * Conversa screen renders it. A write with an `id` that already exists replaces
 * the earlier component, so a stepper updates in place as steps finish.
 *
 * New screens Vigia "learns" are compositions of these parts, not new code.
 */
const StepStatus = v.picklist(['pending', 'running', 'done', 'failed', 'waiting', 'skipped']);

export const UiComponent = v.variant('component', [
  v.object({
    component: v.literal('stepper'),
    id: v.string(),
    title: v.string(),
    status: v.picklist(['running', 'done', 'failed', 'waiting']),
    steps: v.array(v.object({ id: v.string(), label: v.string(), status: StepStatus, note: v.optional(v.string()) })),
  }),
  v.object({
    component: v.literal('status'),
    id: v.string(),
    title: v.string(),
    state: v.picklist(['info', 'running', 'success', 'warning', 'error']),
    text: v.string(),
  }),
  v.object({
    component: v.literal('approval'),
    id: v.string(),
    title: v.string(),
    detail: v.string(),
    category: v.string(),
    inboxId: v.string(),
  }),
  v.object({
    component: v.literal('question'),
    id: v.string(),
    question: v.string(),
    options: v.array(v.string()),
    inboxId: v.string(),
  }),
  v.object({
    component: v.literal('table'),
    id: v.string(),
    title: v.string(),
    columns: v.array(v.string()),
    rows: v.array(v.array(v.string())),
  }),
  v.object({ component: v.literal('link'), id: v.string(), title: v.string(), url: v.string() }),
  v.object({ component: v.literal('code'), id: v.string(), title: v.string(), language: v.string(), text: v.string() }),
  v.object({
    component: v.literal('learning'),
    id: v.string(),
    title: v.string(),
    items: v.array(v.object({ kind: v.string(), summary: v.string() })),
    inboxId: v.string(),
  }),
]);

export type UiComponent = v.InferOutput<typeof UiComponent>;

/**
 * What travels on the wire. A Flue data part is unique per response (a later
 * write replaces it), so the part carries every component of the response,
 * in order; the app renders the list and a component's `id` keeps its place.
 */
export const UiPart = v.object({ components: v.array(UiComponent) });
export type UiPart = v.InferOutput<typeof UiPart>;
