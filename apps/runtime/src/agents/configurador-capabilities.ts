import type { Capability } from './capability.ts';
import { codeAgentSetup } from './tools/code-agent-setup.ts';
import { voice } from './tools/voice.ts';

/** What the configuration chat can do: look at this machine, propose, ask. No procedures, no browser, no code. */
export const CONFIG_CAPABILITIES: readonly Capability[] = [codeAgentSetup, voice];
