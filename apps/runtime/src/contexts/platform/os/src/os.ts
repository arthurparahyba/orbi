import { homedir } from 'node:os';
import type { Platform } from './types.ts';
import { windows } from './windows.ts';
import { linux, macos } from './unix.ts';

export type { Platform, PlatformId } from './types.ts';

/** The implementation for a system (anything that is not Windows or macOS behaves like Linux). */
export function platformFor(id: string): Platform {
  return id === 'win32' ? windows : id === 'darwin' ? macos : linux;
}

/** This machine's system. */
export const platform = (): Platform => platformFor(process.platform);

/**
 * The installed app's folder for the developer's own things (the same the desktop app uses:
 * Tauri's app data dir). Updating the app never touches it.
 */
export function appDataHome(env: NodeJS.ProcessEnv = process.env, id: string = process.platform, home = homedir()): string {
  return platformFor(id).appDataHome(env, home);
}
