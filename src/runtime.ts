import { config } from './config.ts';
import { Inbox } from './inbox.ts';
import { PolicyStore } from './policy/autonomy.ts';
import { BrainStore } from './brain/store.ts';
import { Conversations } from './conversations.ts';

/**
 * Process-wide services. On the Node target agents run inside this process,
 * so tools, hooks and HTTP routes share one instance of each.
 */
export const inbox = new Inbox(config.inboxFile);
export const policy = new PolicyStore(config.policyFile);
export const brain = new BrainStore(config.brainFile);
export const conversations = new Conversations(`${config.dataDir}/conversations.json`);
