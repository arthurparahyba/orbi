/**
 * The `talk` context — where the developer speaks from (documento 26, map in `docs/modulos.md`).
 *
 * This is the context's only door (test/boundary.test.ts checks it). It owns the `conversations`,
 * `deleted_conversations`, `inbox_items` and `followups` tables.
 *
 * conversations  the conversations, their titles and state, the delete and the purge
 * inbox          the cards the developer answers: approval, question, notice, secret
 * followups      the Orbi waking itself up later: scheduled, delivered, failed, cancelled
 * voice          local transcription: the model, its files, the warm-up
 */

export { Conversations } from './conversations/src/conversations.ts';
export type { ConversationInfo, DeleteHook } from './conversations/src/conversations.ts';
export { Inbox } from './conversations/src/inbox.ts';
export type { InboxItem, InboxKind } from './conversations/src/inbox.ts';
export { buildNotebook, nextLevel } from './conversations/src/notebook.ts';
export type { ConversationNotebook, NotebookFacts } from './conversations/src/notebook.ts';
export { conversationState } from './conversations/src/state.ts';
export type { ConversationState, TeachingStage, StateFacts } from './conversations/src/state.ts';
export { purgeDeletedTranscripts } from './conversations/src/purge.ts';
export * from './conversations/src/tell.ts';

export { HANDLERS, handlerFor } from './inbox/src/index.ts';
export type { InboxAction, InboxDeps, InboxHandler } from './inbox/src/types.ts';

export { Followups } from './followups/src/service.ts';
export { startFollowups } from './followups/src/scheduler.ts';
export * from './followups/src/domain.ts';

export { VoiceModel, MODEL_FILES, KNOWN_MODELS } from './voice/src/model.ts';
export type { VoiceState, VoiceStatus } from './voice/src/model.ts';
export { createStt, wavToFloat32, modelLoadError } from './voice/src/stt.ts';
export type { Transcriber, SttReport, SttSlot, ModelProgress } from './voice/src/stt.ts';
export { warmVoice } from './voice/src/warm.ts';

export { conversationRoutes } from './conversations-http.ts';
export { inboxRoutes } from './inbox-http.ts';
export { followupRoutes } from './followups-http.ts';
export { voiceRoutes } from './voice-http.ts';
export { transcribeRoutes } from './transcribe-http.ts';
