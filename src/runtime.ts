import { config } from './config.ts';
import { Inbox } from './inbox.ts';
import { PolicyStore } from './policy/autonomy.ts';
import { BrainStore } from './brain/store.ts';
import { Conversations } from './conversations.ts';
import { Vault } from './vault.ts';

/**
 * Process-wide services. On the Node target agents run inside this process,
 * so tools, hooks and HTTP routes share one instance of each.
 */
export const inbox = new Inbox(config.inboxFile);
export const policy = new PolicyStore(config.policyFile);
export const brain = new BrainStore(config.brainFile);
export const conversations = new Conversations(`${config.dataDir}/conversations.json`);
export const vault = new Vault(config.vault.indexFile, config.vault.dataFile, config.vault.keyFile, config.vault.prefer);
