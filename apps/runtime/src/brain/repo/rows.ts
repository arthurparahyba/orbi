/** Shared helpers to move JSON columns in and out of SQLite. */
export type Row = Record<string, unknown>;
export const now = () => new Date().toISOString();
export const json = (value: unknown) => JSON.stringify(value ?? null);
export const parse = <T>(text: unknown, fallback: T): T => (typeof text === 'string' ? (JSON.parse(text) as T) : fallback);
export const nullable = (value: unknown) => (value as string | null) ?? null;
