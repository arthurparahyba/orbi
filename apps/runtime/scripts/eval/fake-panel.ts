import { createServer, type Server } from 'node:http';

/**
 * A services panel for the behavior evaluation (scripts/eval): environments and their resources
 * (ECS service, NLB, Lambda, SQS queue), each with the numbers that say whether it is up, and a
 * service catalog whose v2 answers 500 without the X-Team header (an error the Orbi never saw).
 */
export interface FakePanel { url: string; registered: string[]; close(): Promise<void> }

interface Resource { id: string; type: 'ServicoECS' | 'NLB' | 'Lambda' | 'FilaSQS'; metrics: Record<string, string> }

export const ENVIRONMENTS: Record<string, Resource[]> = {
  'pagamentos-hml': [
    { id: 'pag-api-svc', type: 'ServicoECS', metrics: { running: '2', desired: '2' } },
    { id: 'pag-nlb-hml', type: 'NLB', metrics: { 'targets healthy': '3 de 3' } },
    { id: 'pag-conciliador', type: 'Lambda', metrics: { 'erros na última hora': '0' } },
  ],
  'cartoes-hml': [
    { id: 'car-api-svc', type: 'ServicoECS', metrics: { running: '1', desired: '2' } },
    { id: 'car-nlb-hml', type: 'NLB', metrics: { 'targets healthy': '2 de 2' } },
    { id: 'car-eventos-hml', type: 'FilaSQS', metrics: { 'mensagens na DLQ': '0', 'mensagem mais antiga': '12 s' } },
  ],
};

const TYPE_LABEL: Record<Resource['type'], string> = { ServicoECS: 'Serviço ECS', NLB: 'Network Load Balancer', Lambda: 'Função Lambda', FilaSQS: 'Fila SQS' };

const page = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px system-ui;margin:0}header{background:#232f3e;color:#fff;padding:12px 24px}main{padding:24px}dl{display:grid;grid-template-columns:200px 1fr;gap:4px}</style></head>
<body><header>Painel de serviços</header><main>${body}</main></body></html>`;

export function startFakePanel(port = 0): Promise<FakePanel> {
  const registered: string[] = [];
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const html = (s: string, status = 200) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(s);
    const json = (v: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(v));
    if (url.pathname === '/' || url.pathname === '/ambientes') {
      return html(page('Ambientes', `<h1>Ambientes</h1><ul>${Object.keys(ENVIRONMENTS).map((e) => `<li><a href="/ambientes/${e}">${e}</a></li>`).join('')}</ul>`));
    }
    const env = url.pathname.match(/^\/ambientes\/([\w-]+)$/)?.[1];
    if (env && ENVIRONMENTS[env]) {
      return html(page(env, `<h1>${env}</h1><h2>Recursos</h2><ul>${ENVIRONMENTS[env].map((r) => `<li><a href="/recursos/${r.id}">${r.id}</a> — ${TYPE_LABEL[r.type]}</li>`).join('')}</ul>`));
    }
    const rid = url.pathname.match(/^\/recursos\/([\w-]+)$/)?.[1];
    const resource = rid && Object.values(ENVIRONMENTS).flat().find((r) => r.id === rid);
    if (resource) {
      return html(page(resource.id, `<h1>${resource.id}</h1><p>${TYPE_LABEL[resource.type]}</p><dl>${Object.entries(resource.metrics).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`));
    }
    if (url.pathname === '/api/v2/catalogo' && req.method === 'POST') {
      const body = await new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
      if (!req.headers['x-team']) return json({ error: 'Internal Server Error' }, 500);
      registered.push(body);
      return json({ ok: true }, 201);
    }
    return html(page('Não encontrado', '<p>Não encontrado.</p>'), 404);
  });
  return new Promise((resolveStart) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address() as { port: number };
      resolveStart({ url: `http://127.0.0.1:${p}`, registered, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

/** The script a procedure runs to register an app in the catalog (seeded in the workspace for scenario 5). */
export const registerScript = (panelUrl: string) => `// registra uma aplicação no catálogo de serviços
// uso: node registrar.mjs <aplicacao> [--team SIGLA]
const [app, flag, team] = process.argv.slice(2);
const res = await fetch('${panelUrl}/api/v2/catalogo', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(flag === '--team' && team ? { 'x-team': team } : {}) },
  body: JSON.stringify({ app }),
});
if (!res.ok) { console.error('POST /api/v2/catalogo -> ' + res.status + ' ' + (await res.text())); process.exit(1); }
console.log('registrado: ' + app);
`;
