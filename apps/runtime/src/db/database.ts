import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './migrations.ts';

/**
 * Orbi's single SQLite file (brain + app state). `openDatabase` brings it up to
 * date: missing migrations run in order, each in its own transaction.
 */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function schemaVersion(db: DatabaseSync): number {
  return Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
}

export function migrate(db: DatabaseSync): number {
  let version = schemaVersion(db);
  for (const [i, migration] of MIGRATIONS.entries()) {
    if (i < version) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
      version = i + 1;
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`migração ${i + 1} (${migration.name}) falhou: ${(error as Error).message}`);
    }
  }
  return version;
}

/** Runs `fn` in a transaction: all of it lands, or none. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Before the single database, the brain lived in brain.db and the app state in
 * JSON files. Move the old brain.db to the new name once, if needed.
 */
export function adoptLegacyBrain(dbFile: string, legacyBrainFile: string): void {
  if (existsSync(dbFile) || !existsSync(legacyBrainFile)) return;
  mkdirSync(dirname(dbFile), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(legacyBrainFile + suffix)) renameSync(legacyBrainFile + suffix, dbFile + suffix);
  }
}

/** Reads a legacy JSON file once and renames it, so it is never imported twice. */
export function takeLegacyJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as T;
    renameSync(file, `${file}.importado`);
    return value;
  } catch {
    return undefined;
  }
}
