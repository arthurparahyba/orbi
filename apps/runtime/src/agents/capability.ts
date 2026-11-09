import type { OrbiServices } from '../services.ts';
import type { AgentContext } from './context.ts';

/** The parts of the Orbi a capability said it needs. */
export type Deps<K extends keyof OrbiServices> = Pick<OrbiServices, K>;

/** A capability as the agent registers it (see defineCapability). */
export interface Capability {
  name: string;
  needs: ReadonlyArray<keyof OrbiServices>;
  register(ctx: AgentContext, deps: Partial<OrbiServices>): void;
}

/**
 * A capability (hands, memory, voice, clock…) says what it needs and gets only that, when the
 * agent registers it: its dependencies are in its declaration, not hidden in a global lookup,
 * and a test hands it exactly those parts. A new capability is a new file plus one line in
 * agents/capabilities.ts.
 */
export function defineCapability<const K extends keyof OrbiServices>(c: {
  name: string;
  needs: readonly K[];
  register(ctx: AgentContext, deps: Deps<K>): void;
}): Capability {
  return c as unknown as Capability;
}

/** Only the declared parts: using one not declared is a type error, and undefined at run time. */
export function depsFor<K extends keyof OrbiServices>(all: OrbiServices, needs: readonly K[]): Deps<K> {
  return Object.fromEntries(needs.map((k) => [k, all[k]])) as Deps<K>;
}

export function registerCapabilities(list: readonly Capability[], ctx: AgentContext, all: OrbiServices): void {
  for (const c of list) c.register(ctx, depsFor(all, c.needs));
}
