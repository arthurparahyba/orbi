// A fake MCP server that Orbi starts as a program (stdio), for the tests of
// docs/funcionalidades/20, fase 4. It reports what it can see of its environment:
// the variable declared with a vault reference, and whether a variable of the
// runtime that was not declared leaked into it.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'chamados-falso', version: '1.0.0' });
server.registerTool('ver_ambiente', { description: 'Mostra o ambiente do programa', annotations: { readOnlyHint: true } }, async () => ({
  content: [{ type: 'text', text: `token=${process.env.CHAMADOS_TOKEN ?? '-'} vazou=${process.env.ORBI_TESTE_PRIVADO ?? 'nao'} pasta=${process.cwd()}` }],
}));
server.registerTool('abrir_chamado', { description: 'Abre um chamado', annotations: { readOnlyHint: false } }, async () => ({ content: [{ type: 'text', text: 'chamado aberto' }] }));
await server.connect(new StdioServerTransport());
