import type { Agent as FlueAgent, createAgentRouter } from '../../agents/runtime-port.ts';

/** The agent the routes talk to (passed in, so routes have no import cycle with it). */
export type Agent = Parameters<typeof createAgentRouter>[0] & FlueAgent;
