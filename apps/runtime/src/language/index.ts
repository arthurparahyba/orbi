/**
 * The shared language: the words every context uses to talk about the same things — a fact, a
 * procedure, a run, a level. Types and constants only, no state and no database, so any context
 * may import it and it imports none of them (documento 26, map in `docs/modulos.md`).
 */

export * from './types.ts';
export * from './levels.ts';
