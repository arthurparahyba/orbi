declare const __ORBI_BUILD__: string | undefined;

/** Which build this runtime is (scripts/build-app.mjs); 'dev' outside an installed app. */
export const BUILD: string = typeof __ORBI_BUILD__ === 'string' ? __ORBI_BUILD__ : 'dev';
