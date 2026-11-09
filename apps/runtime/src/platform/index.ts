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
