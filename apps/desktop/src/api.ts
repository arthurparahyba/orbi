/**
 * Talking to the local runtime — um arquivo por contexto, pelo mesmo corte do runtime (documento
 * 26, fase 6). `api` continua sendo um objeto só: quem chama não muda, e cada método mora no
 * contexto de quem responde por ele.
 */

import { platformApi } from './api/platform.ts';
import { talkApi } from './api/talk.ts';
import { knowledgeApi } from './api/knowledge.ts';
import { proceduresApi } from './api/procedures.ts';
import { trustApi } from './api/trust.ts';
import { improvementApi } from './api/improvement.ts';
import { telemetryApi } from './api/telemetry.ts';
import { toolsApi } from './api/tools.ts';
import { modelsApi } from './api/models.ts';
import { secretsApi } from './api/secrets.ts';
import { agentsApi } from './api/agents.ts';

export type * from '@orbi/contracts';
export { RUNTIME_URL, agentUrl, configAgentUrl, CODE_AGENTS_CHAT, isConfigChat, request } from './api/request.ts';

export const api = {
  ...platformApi,
  ...talkApi,
  ...knowledgeApi,
  ...proceduresApi,
  ...trustApi,
  ...improvementApi,
  ...telemetryApi,
  ...toolsApi,
  ...modelsApi,
  ...secretsApi,
  ...agentsApi,
};
