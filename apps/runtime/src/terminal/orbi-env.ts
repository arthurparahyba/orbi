/**
 * The variables that are the Orbi's, not the developer's: its settings (ORBI_*), its model key,
 * the Chrome bridge's, and whatever the Orbi's own .env added (GH_TOKEN for the Orbi's commands,
 * for example). A program that gets the developer's environment (a coding agent) never gets these.
 */
const fromOrbiEnvFile = new Set<string>();

export function rememberOrbiEnvKeys(keys: Iterable<string>): void {
  for (const k of keys) fromOrbiEnvFile.add(k);
}

export function orbiOwn(key: string): boolean {
  return fromOrbiEnvFile.has(key) || /^ORBI_/i.test(key) || /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CHROME_MCP_|CHROME_DEBUG_)/i.test(key);
}
