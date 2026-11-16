/**
 * The `trust` context — what the Orbi may do on its own (documento 26, map in `docs/modulos.md`).
 *
 * This is the context's only door (test/boundary.test.ts checks it). It owns the
 * `autonomy_events` and `playbook_known_actions` tables.
 *
 * levels  the level a procedure sits at, how it rises and falls, and the actions it already knows
 * policy  what the developer allows by subject, and the effect an action has
 *
 * The gate itself lives in the composition (`agents/gate.ts`): it is a Flue capability that
 * applies these rules to every tool call.
 */

export { Autonomy } from './levels/src/service.ts';
export type { ProcedureStore } from './levels/src/service.ts';
export { LevelRepo } from './levels/src/repo.ts';
export type { AutonomyEvent, KnownAction } from './levels/src/repo.ts';
export { levelState } from './levels/src/level-state.ts';
export {
  decideAction,
  askReason,
  settleLevel,
  levelAfterEdit,
  runDeviations,
  activeDeviations,
  workedAround,
  stepUses,
  isCallError,
  fingerprintWith,
  defaultFingerprint,
} from './levels/src/rules.ts';

export {
  decide,
  effectOfCategory,
  levelOf,
  parsePolicy,
  isMcpCategory,
  commandEffect,
  commandCategory,
  codeFixCategory,
  isTestOnlyChange,
  browserCategory,
  gitVerbArgs,
  BROWSER_READ_TOOLS,
  DEFAULT_POLICY,
  PolicyStore,
} from './policy/src/policy.ts';
export type { Category, FixedCategory, McpCategory, AutonomyLevel, AutonomyPolicy } from './policy/src/policy.ts';

export { autonomyRoutes } from './http.ts';
