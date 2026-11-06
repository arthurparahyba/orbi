import { loadConfig, loadDotEnv } from './config.ts';
import { createOrbi, startBackground } from './compose.ts';
import { provideServices } from './services.ts';
import { createHttpApp } from './http/app.ts';
import { Orbi } from './agents/orbi.ts';
import { createLogger, logOptionsFromEnv, setLogger } from './observability/log.ts';

/**
 * Entry point Flue serves (`dist/server.mjs` imports it): read the
 * configuration, build Orbi's parts, start what runs in the background and
 * hand the HTTP app to the server. This is the only module with side effects.
 */
loadDotEnv();
setLogger(createLogger(logOptionsFromEnv())); // ORBI_LOG_* may come from the .env
const orbi = await createOrbi(loadConfig());
provideServices(orbi);
const background = startBackground(orbi, Orbi);

export default createHttpApp(orbi, background, Orbi);
