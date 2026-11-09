import { tellAgent } from '../conversations/tell.ts';
import type { InboxHandler } from './types.ts';

/** An action that waits for approval (a gated tool or a learning card): the decision goes to the conversation. */
export const approval: InboxHandler = {
  id: 'aprovação',
  matches: (item) => (item.kind === 'approval' || item.kind === 'learning') && !!item.approvalId,
  async decide(item, { decision, approver }, d) {
    // Delivered first, marked after: if the message cannot reach the conversation, the card
    // stays open with the error instead of saying "decided" while nothing happens.
    const receipt = await tellAgent(d.events, d.agent, {
      id: item.conversationId,
      message: {
        kind: 'signal',
        type: 'tool-approval',
        body: `${approver} ${decision === 'approve' ? 'aprovou' : 'negou'}: ${item.title}`,
        attributes: { approvalId: item.approvalId!, decision, approver },
      },
    });
    d.inbox.resolve(item.id, decision === 'approve' ? 'approved' : 'denied');
    return { status: 202, body: receipt };
  },
};
