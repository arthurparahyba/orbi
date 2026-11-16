/**
 * Shapes of the runtime's HTTP API (`/api/*`), as the desktop app reads them — um arquivo por
 * contexto, pelo mesmo corte do runtime (documento 26, fase 6). O runtime confere os próprios
 * tipos contra estes em `src/contract-check.ts`, então uma mudança de um lado que quebra o outro
 * falha no `npm test` (typecheck).
 */

export * from './api/agents.ts';
export * from './api/improvement.ts';
export * from './api/knowledge.ts';
export * from './api/models.ts';
export * from './api/platform.ts';
export * from './api/procedures.ts';
export * from './api/secrets.ts';
export * from './api/talk.ts';
export * from './api/telemetry.ts';
export * from './api/tools.ts';
export * from './api/trust.ts';
