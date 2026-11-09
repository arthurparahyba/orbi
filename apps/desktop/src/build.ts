declare const __ORBI_BUILD__: string | undefined;

/** Which build this app is (scripts/build-app.mjs); 'dev' outside an installed app. */
export const APP_BUILD: string = typeof __ORBI_BUILD__ === 'string' ? __ORBI_BUILD__ : 'dev';

/**
 * The runtime that answers on 127.0.0.1:3000 is another build than this app (an older install
 * still running, or an `npm start` left open): its routes and fixes are not this version's.
 */
export function otherRuntime(runtimeBuild: string | undefined, appBuild = APP_BUILD): boolean {
  // A runtime from before the stamp existed has none: also another build.
  return appBuild !== 'dev' && runtimeBuild !== appBuild;
}
