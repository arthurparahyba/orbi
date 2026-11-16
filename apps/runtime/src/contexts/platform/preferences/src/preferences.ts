import type { DatabaseSync } from 'node:sqlite';

/**
 * What the developer chose and the app keeps between runs: one JSON value per key, in the
 * `settings` table, of which this context is the owner (documento 26).
 *
 * Nobody else writes that table in raw SQL: `autonomy`, `voice`, `models/roles`,
 * `models/cost` and `improvement/diagnosis` each take a `Preferences` and keep their own key.
 * The key names the subject, in the shape `<assunto>` or `<contexto>-<assunto>`, and a write
 * turns into the `autonomy` event through `db/changes.ts`.
 */
export class Preferences {
  constructor(private readonly db: DatabaseSync) {}

  /** The value of a key, or undefined when it was never set (or is not valid JSON any more). */
  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  clear(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}
