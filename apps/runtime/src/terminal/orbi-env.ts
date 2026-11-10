/**
 * The variables that are the Orbi's, not the developer's: its settings (ORBI_*), its model key,
 * the Chrome bridge's, and whatever the Orbi's own .env added (GH_TOKEN for the Orbi's commands,
 * for example). A program that gets the developer's environment (a coding agent) never gets these.
 */
const fromOrbiEnvFile = new Set<string>();

export function rememberOrbiEnvKeys(keys: Iterable<string>): void {
  for (const k of keys) fromOrbiEnvFile.add(k);
}

/**
 * The Orbi itself was started from inside a coding agent's session (Claude Code ran `npm start`):
 * its environment then carries that session's identity (CLAUDECODE, CLAUDE_CODE_SESSION_ID, a
 * proxy in ANTHROPIC_BASE_URL, its OAuth…). A `claude` started by the Orbi would take them as its
 * own and fail ("OAuth session expired"), so none of them is handed on.
 */
export function insideAgentSession(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAUDECODE === '1' || !!env.CLAUDE_CODE_ENTRYPOINT || !!env.CLAUDE_CODE_SESSION_ID;
}

export function orbiOwn(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (insideAgentSession(env) && /^(CLAUDE|ANTHROPIC)/i.test(key)) return true;
  // ANTHROPIC_API_KEY is the Orbi's only when the Orbi's .env (or its model screen) put it there:
  // the developer's own, from their shell, is theirs (their claude may log in with it).
  return fromOrbiEnvFile.has(key) || /^ORBI_/i.test(key) || /^(CHROME_MCP_|CHROME_DEBUG_)/i.test(key);
}

/** The developer's session without what is the Orbi's: for their own tools (a terminal window, a coding agent). */
export function developerEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k, v]) => v !== undefined && !orbiOwn(k, env)));
}
