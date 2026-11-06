import { loadConfig, loadDotEnv } from '../config.ts';
import { startBridge } from './bridge.ts';

// Run the Chrome DevTools bridge on its own: `npm run bridge:chrome`.
loadDotEnv();
const config = loadConfig();
const bridge = await startBridge({
  port: config.chrome.port,
  token: config.chrome.token,
  chrome: { browserUrl: config.chrome.browserUrl, headless: config.chrome.headless },
});
console.log(`chrome-devtools-mcp bridge on ${bridge.url} — ${bridge.toolNames.length} tools`);
if (!process.env.CHROME_MCP_TOKEN) console.log(`token (set CHROME_MCP_TOKEN to fix it): ${config.chrome.token}`);
const stop = async () => {
  await bridge.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
