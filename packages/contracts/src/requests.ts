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
export type SetAutonomy = v.InferOutput<typeof SetAutonomy>;
