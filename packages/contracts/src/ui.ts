import * as v from 'valibot';

/**
 * The component catalog the desktop app knows how to draw (shared by runtime and desktop). The agent never
 * sends HTML: it sends one of these shapes on the `ui` data channel and the
 * Conversa screen renders it. A write with an `id` that already exists replaces
 * the earlier component, so a stepper updates in place as steps finish.
 *
 * New screens Orbi "learns" are compositions of these parts, not new code.
 */
const StepStatus = v.picklist(['pending', 'running', 'done', 'failed', 'waiting', 'skipped']);

/** An existing playbook as the cards show it; the runtime fills it from the brain, never the model. */
const KnownPlaybook = v.object({ name: v.string(), description: v.string(), uses: v.number(), successes: v.number(), learnedAt: v.string() });

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
    /** What it does to the world: reads, changes this machine, publishes outside, deletes. */
    effect: v.optional(v.picklist(['leitura', 'local', 'publica', 'apaga'])),
    /** The command or action in one line. */
    command: v.optional(v.string()),
    /** Why it asks (the level, or that the action is new). */
    reason: v.optional(v.string()),
    /** "passo 2 de 4 · Copiar o index.html". */
    step: v.optional(v.string()),
  }),
  v.object({
    component: v.literal('level'),
    id: v.string(),
    playbook: v.string(),
    from: v.number(),
    to: v.number(),
    reason: v.string(),
    /** Known actions it now does alone, and those it still asks. */
    alone: v.array(v.string()),
    asks: v.array(v.string()),
    /** What it takes to go further, if anything. */
    next: v.optional(v.string()),
    inboxId: v.optional(v.string()),
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
    // "Já sei fazer isso": the same thing as a playbook; Orbi goes on with it.
    component: v.literal('known'),
    id: v.string(),
    playbook: KnownPlaybook,
  }),
  v.object({
    // "Já sei algo parecido": similar, not the same; the developer chooses what to do.
    component: v.literal('similar'),
    id: v.string(),
    known: v.string(),
    relation: v.string(),
    playbook: KnownPlaybook,
    reuse: v.array(v.string()),
    changes: v.array(v.string()),
    suggestion: v.string(),
    options: v.array(v.object({ label: v.string(), hint: v.optional(v.string()) })),
    inboxId: v.string(),
  }),
  v.object({
    // A credential Orbi needs: the developer types it in the card and it goes straight to the vault.
    component: v.literal('secret'),
    id: v.string(),
    /** Proposed name; the developer may change it. */
    name: v.string(),
    description: v.string(),
    reason: v.string(),
    inboxId: v.string(),
  }),
  v.object({
    component: v.literal('learning'),
    id: v.string(),
    title: v.string(),
    items: v.array(v.object({ kind: v.string(), summary: v.string() })),
    inboxId: v.string(),
  }),
  v.object({
    /** A code change the Orbi applied (Pontos importantes): what, why, who, and whether it went alone. */
    component: v.literal('code_change'),
    id: v.string(),
    title: v.string(),
    repo: v.string(),
    branch: v.string(),
    commit: v.string(),
    files: v.array(v.string()),
    why: v.string(),
    agent: v.string(),
    /** Applied without asking (level + known problem), so the developer is told. */
    alone: v.boolean(),
    diff: v.optional(v.string()),
    inboxId: v.optional(v.string()),
  }),
  v.object({
    /** Facts a run learned by itself (passo 0): the name given, what it turned out to be, and Desfazer. */
    component: v.literal('learned_facts'),
    id: v.string(),
    title: v.string(),
    runId: v.string(),
    items: v.array(
      v.object({
        input: v.string(),
        value: v.string(),
        entity: v.string(),
        /** created: a new fact; alias: the name given became another name of `entity`. */
        learned: v.picklist(['created', 'alias']),
        undone: v.boolean(),
      }),
    ),
  }),
  v.object({
    /** The end of a rehearsal: where the procedure starts and ends, what it receives, what stays out, what was corrected. */
    component: v.literal('agreement'),
    id: v.string(),
    runId: v.string(),
    question: v.string(),
    start: v.string(),
    receives: v.array(v.string()),
    end: v.string(),
    outside: v.array(v.string()),
    corrections: v.array(v.object({ explained: v.string(), actual: v.string() })),
    inboxId: v.string(),
  }),
  v.object({
    /** Before a run over concepts: what the Orbi knows and does not know of what it needs ("sei / não sei"). */
    component: v.literal('readiness'),
    id: v.string(),
    title: v.string(),
    items: v.array(v.object({ label: v.string(), known: v.boolean(), detail: v.string() })),
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
