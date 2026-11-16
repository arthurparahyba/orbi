/**
 * A conversa: a lista, o caderno ao lado, o que espera o desenvolvedor (inbox), os retornos e o
 * ditado.
 */

import type { ConversationInfo, ConversationNotebook, Followup, InboxItem, ProvideSecret, VoiceStatus } from '@orbi/contracts';
import { request } from './request.ts';

export const talkApi = {
  conversations: () => request<ConversationInfo[]>('/api/conversations'),
  createConversation: (title?: string) => request<ConversationInfo>('/api/conversations', { method: 'POST', body: JSON.stringify({ title }) }),
  /** A message written inside a card: goes to the same conversation, shown in the card (docs/funcionalidades/21). */
  cardMessage: (conversationId: string, m: { card: string; title: string; context: string; text: string }) =>
    request<unknown>(`/api/conversations/${encodeURIComponent(conversationId)}/card-message`, { method: 'POST', body: JSON.stringify(m) }),
  /** The model a conversation uses from its next turn; null = the default. */
  setConversationModel: (id: string, model: string | null) =>
    request<ConversationInfo>(`/api/conversations/${encodeURIComponent(id)}/model`, { method: 'PUT', body: JSON.stringify({ model }) }),
  /** The "O que estou aprendendo" panel of a conversation, from the brain. */
  notebook: (id: string) => request<ConversationNotebook>(`/api/conversations/${encodeURIComponent(id)}/notebook`),
  deleteConversation: (id: string) => request<{ deleted: true }>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  renameConversation: (id: string, title: string) =>
    request<ConversationInfo>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  inbox: (status: InboxItem['status'] | 'all' = 'open') => request<InboxItem[]>(`/api/inbox${status === 'all' ? '?status=' : `?status=${status}`}`),
  decide: (id: string, decision: 'approve' | 'deny') =>
    request(`/api/inbox/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, approver: 'Você' }) }),
  provideSecret: (id: string, secret: ProvideSecret) => request(`/api/inbox/${id}/secret`, { method: 'POST', body: JSON.stringify(secret) }),
  answer: (id: string, text: string) => request(`/api/inbox/${id}/answer`, { method: 'POST', body: JSON.stringify({ text }) }),
  /** A note (level changed): seen, or undo the change. */
  dismissInbox: (id: string) => request(`/api/inbox/${id}/dismiss`, { method: 'POST' }),
  keepInbox: (id: string) => request(`/api/inbox/${id}/keep`, { method: 'POST' }),
  voice: () => request<VoiceStatus>('/api/voice'),
  /** Follow-ups waiting (all, or of one conversation), soonest first. */
  followups: (conversation?: string) => request<Followup[]>(`/api/followups${conversation ? `?conversation=${encodeURIComponent(conversation)}` : ''}`),
  cancelFollowup: (id: string) => request<Followup>(`/api/followups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  prepareVoice: () => request<VoiceStatus>('/api/voice/prepare', { method: 'POST' }),
  chooseVoiceModel: (model: string | null) => request<VoiceStatus>('/api/voice/model', { method: 'PUT', body: JSON.stringify({ model }) }),
};
