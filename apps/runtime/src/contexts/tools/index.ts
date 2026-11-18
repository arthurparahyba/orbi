/**
 * The `tools` context — what the Orbi acts on the world with (documento 26, map in
 * `docs/modulos.md`).
 *
 * This is the context's only door (test/boundary.test.ts checks it). It owns the `code_agents`,
 * `code_agent_tasks`, `mcp_servers` and `mcp_tools` tables.
 *
 * terminal      commands on the machine, the programs allowed, the output cleaned
 * browser       the shared Chrome, the screen recording, the devtools MCP bridge
 * mcp-client    the MCP servers the developer registered, and the connections to them
 * code-agents   the code agents on the machine, their tasks and the throwaway copy
 * commands      what each known program does (git, gh, aws, build)
 */

export { testCodeAgent, type Tested, type NotTested } from './use-cases/test-code-agent.ts';
export { startDemonstration, type NotStarted } from './use-cases/start-demonstration.ts';

export * from './terminal/src/runner.ts';
export * from './terminal/src/shell.ts';
export * from './terminal/src/exec.ts';
export * from './terminal/src/orbi-env.ts';
export * from './terminal/src/shell-path.ts';

export * from './browser/src/chrome.ts';
export * from './browser/src/settings.ts';
export * from './browser/src/recorder.ts';
export * from './browser/src/page-recorder.ts';
export * from './browser/src/mcp/chrome-devtools.ts';

export * from './mcp-client/src/hub.ts';
export * from './mcp-client/src/store.ts';
export * from './mcp-client/src/domain.ts';
export * from './mcp-client/src/schema.ts';

export * from './code-agents/src/index.ts';
export * from './code-agents/src/run.ts';

export * from './commands/src/index.ts';

export { browserRoutes } from './browser-http.ts';
export { recordingRoutes } from './recordings-http.ts';
export { codeAgentRoutes } from './code-agents-http.ts';
export { mcpServerRoutes } from './mcp-servers-http.ts';
