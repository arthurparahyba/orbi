import type { OrbiServices } from '../../../services.ts';
import { testAgent } from '../code-agents/src/tester.ts';

/**
 * Testar um agente de código cadastrado: manda um pedido curto ("responda ok") para saber se ele
 * está instalado, logado e roda de uma vez. Gasta um pedido da conta do agente, então só acontece
 * quando o desenvolvedor pede — pela ferramenta `code_agent_test` (com aprovação no cartão) ou
 * pelo botão Testar da tela (`POST /api/code-agents/:id/test`). Os dois passam por aqui.
 */

export interface Tested {
  ok: boolean;
  detail: string;
}

/** O agente não está cadastrado: não há o que testar. */
export interface NotTested {
  refused: string;
}

type Deps = Pick<OrbiServices, 'codeAgents' | 'config'>;

export async function testCodeAgent(d: Deps, request: { agent: string; model?: string | null }): Promise<Tested | NotTested> {
  const agent = d.codeAgents.get(request.agent);
  if (!agent) return { refused: `agente não cadastrado: ${request.agent}` };

  const result = await testAgent(agent, {
    model: request.model ?? null,
    scratchDir: d.config.scratchDir,
    shell: d.config.shell,
    env: d.config.cliEnv,
  });

  // Agente que veio do ambiente não é cadastro nosso: o teste dele não fica guardado.
  if (agent.source !== 'env') d.codeAgents.recordTest(agent.id, result);
  return result;
}
