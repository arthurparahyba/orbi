import type { McpHub } from '../../../mcp-client/src/hub.ts';
import type { McpServers } from '../../../mcp-client/src/store.ts';

/**
 * O navegador do Orbi (documento 31). Até aqui o Chrome vinha embarcado: a aplicação trazia o
 * `chrome-devtools-mcp` dentro dela e subia uma ponte stdio→HTTP no boot. Dava problema demais —
 * uma versão do Chrome, um perfil, uma porta e um processo filho a mais para dar errado, dentro de
 * um instalador que a pessoa não escolheu.
 *
 * Agora quem escolhe é o desenvolvedor: ele cadastra o servidor MCP de navegador que quiser
 * (documento 20, por comando — `npx chrome-devtools-mcp`, ou outro) e marca "este é o navegador".
 * Daí a leitura de página aparece ao modelo como `mcp__<servidor>__*`, com autonomia por
 * ferramenta, e `browser_act` passa por aqui para chegar ao mesmo servidor.
 *
 * Sem nenhum marcado, isto recusa com a frase que diz o que fazer. É assim que a aplicação é
 * instalada: sem navegador nenhum.
 */
export interface BrowserMcp {
  /**
   * Chama uma ferramenta no servidor marcado como navegador.
   *
   * `signal`: desistir de esperar (o desenvolvedor parou o turno). `full`: a resposta inteira,
   * para quem vai gravá-la em arquivo; sem isso o texto é cortado no que um modelo deve ler.
   */
  call(tool: string, args: Record<string, unknown>, signal?: AbortSignal, opts?: { full?: boolean }): Promise<string>;
  /** O id do servidor escolhido, ou nada: a tela e os prompts dizem isso à pessoa. */
  serverId(): string | undefined;
}

/** O que a pessoa precisa fazer quando não há navegador marcado. */
export const NO_BROWSER =
  'Nenhum servidor MCP de navegador está marcado. Em Configurações › Servidor MCP, cadastre um ' +
  '(por comando, ex.: npx chrome-devtools-mcp) e marque "este é o navegador do Orbi".';

export function createBrowserMcp(d: { servers: Pick<McpServers, 'browser'>; hub: Pick<McpHub, 'call'> }): BrowserMcp {
  const chosen = () => d.servers.browser();
  return {
    serverId: () => chosen()?.id,
    async call(tool, args, signal, opts) {
      const server = chosen();
      if (!server) throw new Error(NO_BROWSER);
      return d.hub.call(server.id, tool, args, signal, { full: opts?.full });
    },
  };
}
