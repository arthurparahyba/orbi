import type { dispatch } from '@flue/runtime';
import type { createAgentRouter } from '@flue/runtime/routing';

/** The agent the routes talk to (passed in, so routes have no import cycle with it). */
export type Agent = Parameters<typeof createAgentRouter>[0] & Parameters<typeof dispatch>[0];
