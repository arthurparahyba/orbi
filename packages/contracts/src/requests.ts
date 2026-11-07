import * as v from 'valibot';

/**
 * Bodies the HTTP API accepts. The runtime validates every request against
 * these; the app builds its requests from the same types.
 */

export const CreateConversation = v.object({ title: v.optional(v.pipe(v.string(), v.maxLength(200))) });
export const RenameConversation = v.object({ title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)) });

export const Decision = v.object({
  decision: v.picklist(['approve', 'deny']),
  approver: v.optional(v.pipe(v.string(), v.maxLength(100))),
});
export const Answer = v.object({ text: v.pipe(v.string(), v.minLength(1)) });

export const StartRecording = v.object({
  conversationId: v.pipe(v.string(), v.minLength(1)),
  url: v.optional(v.string()),
  narrated: v.optional(v.boolean()),
});
export const StopRecording = v.object({ discard: v.optional(v.boolean()) });

export const SetSecret = v.object({ value: v.pipe(v.string(), v.minLength(1)), description: v.optional(v.string()) });

const AutonomyLevel = v.picklist(['observe', 'ask', 'auto']);
export const SetPlaybookAutonomy = v.object({ autonomy: AutonomyLevel });
/** PATCH /api/brain/entities/:id — the developer corrects an entity. */
export const EditEntity = v.object({
  props: v.optional(v.record(v.string(), v.unknown())),
  body: v.optional(v.string()),
});
const PlaybookStep = v.object({
  id: v.pipe(v.string(), v.trim(), v.minLength(1, 'passo sem id')),
  label: v.pipe(v.string(), v.trim(), v.minLength(1, 'passo sem nome')),
  how: v.string(),
});
/** PUT /api/brain/playbooks/:name — the developer edits a playbook (name, autonomy and base stay). */
export const EditPlaybook = v.object({
  description: v.optional(v.string()),
  trigger: v.optional(v.string()),
  appliesTo: v.optional(v.nullable(v.string())),
  steps: v.optional(v.pipe(v.array(PlaybookStep), v.minLength(1, 'o procedimento precisa de pelo menos um passo'))),
  instructions: v.optional(v.string()),
});
export const SetAutonomy = v.object({
  category: v.picklist(['comandos-leitura', 'comandos-escrita', 'navegador-leitura', 'navegador-escrita', 'codigo-teste', 'codigo-producao', 'aprender']),
  level: AutonomyLevel,
});

export const InboxStatusQuery = v.optional(v.picklist(['open', 'approved', 'denied', 'answered', '']));
/** GET /api/usage?days= : 1 to 365 days back (default 30). */
export const UsageDaysQuery = v.optional(
  v.pipe(v.string(), v.regex(/^\d{1,3}$/), v.transform(Number), v.number(), v.minValue(1), v.maxValue(365)),
  '30',
);

/** Every error the API returns has this shape. */
/**
 * POST /api/inbox/:id/secret — the credential typed in the chat card. Goes to
 * the vault, never to the conversation. Without `value`, keeps the one already there.
 */
export const ProvideSecret = v.object({
  name: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9._/@-]{0,127}$/, 'nome inválido: letras minúsculas, números e . _ / @ -')),
  value: v.optional(v.pipe(v.string(), v.minLength(1))),
  description: v.optional(v.pipe(v.string(), v.maxLength(200))),
});

/** POST /api/agents/clients — connect a coding agent. */
export const CreateAgentClient = v.object({ name: v.pipe(v.string(), v.trim(), v.minLength(1, 'dê um nome ao agente'), v.maxLength(80)) });
/** PATCH /api/agents/clients/:id — what the agent may do besides searching. */
export const EditAgentClient = v.object({ canDelegate: v.optional(v.boolean()), canTeach: v.optional(v.boolean()) });
/** POST /api/agents/suggestions/:id/accept — optionally as a variation of a known procedure. */
export const AcceptSuggestion = v.object({ variationOf: v.optional(v.pipe(v.string(), v.minLength(1))) });
export const SuggestionStatusQuery = v.optional(v.picklist(['open', 'accepted', 'rejected', '']));

export interface ApiError {
  error: {
    /** Stable, for code: invalid_body, not_found, conflict, unauthorized, too_large, internal. */
    code: string;
    /** For people, in Portuguese. */
    message: string;
    /** Validation issues, when code = invalid_body. */
    details?: Array<{ path: string; message: string }>;
  };
}

export type CreateConversation = v.InferOutput<typeof CreateConversation>;
export type RenameConversation = v.InferOutput<typeof RenameConversation>;
export type Decision = v.InferOutput<typeof Decision>;
export type Answer = v.InferOutput<typeof Answer>;
export type StartRecording = v.InferOutput<typeof StartRecording>;
export type StopRecording = v.InferOutput<typeof StopRecording>;
export type SetSecret = v.InferOutput<typeof SetSecret>;
export type SetPlaybookAutonomy = v.InferOutput<typeof SetPlaybookAutonomy>;
export type EditEntity = v.InferOutput<typeof EditEntity>;
export type EditPlaybook = v.InferOutput<typeof EditPlaybook>;
export type SetAutonomy = v.InferOutput<typeof SetAutonomy>;
export type CreateAgentClient = v.InferOutput<typeof CreateAgentClient>;
export type EditAgentClient = v.InferOutput<typeof EditAgentClient>;
export type AcceptSuggestion = v.InferOutput<typeof AcceptSuggestion>;
export type ProvideSecret = v.InferOutput<typeof ProvideSecret>;
