/**
 * The `telemetry` context — what happened (documento 26, map in `docs/modulos.md`).
 *
 * One module only, so the code is flat in `src/`. This is the context's only door. It owns the
 * `usage` table: model and tool spend per conversation, the log, the outcome of the last call,
 * and the observations of the run in progress. It asks `talk` for a conversation's name instead
 * of joining its table.
 */

export * from './src/log.ts';
export { UsageStore } from './src/usage.ts';
export type { TitleOf, UsageReport } from './src/usage.ts';
export * from './src/telemetry.ts';
export * from './src/tool-outcomes.ts';
export * from './src/run-observations.ts';

export { usageRoutes } from './http.ts';
