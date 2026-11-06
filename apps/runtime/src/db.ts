import { sqlite } from '@flue/runtime/node';
import { loadConfig, loadDotEnv } from './config.ts';

// Flue's own store (conversations and their streams). Flue loads this file by
// convention, possibly before app.ts, so it reads the configuration itself.
loadDotEnv();
export default sqlite(loadConfig().flueDb);
