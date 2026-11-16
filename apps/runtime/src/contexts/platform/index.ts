/**
 * The `platform` context — where the Orbi is running (documento 26, map in `docs/modulos.md`).
 *
 * This is the context's only door (test/boundary.test.ts checks it). It owns the `settings`
 * table: nobody else reads or writes it in raw SQL.
 *
 * os           differences between operating systems, one implementation each
 * env          the installation's .env file
 * preferences  what the developer chose and that stays between runs
 */

export { platform, platformFor, appDataHome } from './os/src/os.ts';
export type { Platform, PlatformId } from './os/src/os.ts';

export { setEnvValue, withEnvValue } from './env/src/env-file.ts';

export { Preferences } from './preferences/src/preferences.ts';
