import { createServer, type Server } from 'node:http';

/**
 * A tiny stand-in for an internal portal: login, a list of micro-frontends,
 * and a config page with tabs and a "Versão" field. Used by the demonstration
 * end-to-end test and by `npm run demo`.
 */
export interface FakePortal { url: string; state: { versions: Record<string, string>; logins: number }; close(): Promise<void> }

const page = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px system-ui;margin:0;background:#f5f6f8;color:#1d2330}header{background:#1d2330;color:#fff;padding:12px 24px}main{padding:24px;max-width:720px}
.card{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px #0002}label{display:block;margin:12px 0 4px}input{padding:8px;width:260px}
button{margin-top:14px;padding:8px 16px;background:#2457d6;color:#fff;border:0;border-radius:6px}[role=tablist]{display:flex;gap:4px;margin-bottom:16px}
[role=tab]{background:#e3e7ef;color:#1d2330;margin:0}[role=tab][aria-selected=true]{background:#2457d6;color:#fff}a{color:#2457d6}li{margin:6px 0}</style></head>
<body><header>Portal Interno</header><main>${body}</main></body></html>`;

export function startFakePortal(port = 0): Promise<FakePortal> {
  const state = { versions: { 'novo-front': '0.1.0', 'checkout-mfe': '3.2.0' } as Record<string, string>, logins: 0 };
  const USER = 'arthur', PASS = 's3nh@-Portal!';
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const logged = /sessao=ok/.test(req.headers.cookie ?? '');
    const body = req.method === 'POST' ? new URLSearchParams(await new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); })) : undefined;
    const html = (s: string) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(s);
    const go = (to: string, cookie?: string) => res.writeHead(303, { location: to, ...(cookie ? { 'set-cookie': cookie } : {}) }).end();

    if (url.pathname === '/logout') return go('/login', 'sessao=; Max-Age=0; Path=/');
    if (url.pathname === '/login' && req.method === 'POST') {
      if (body?.get('usuario') === USER && body?.get('senha') === PASS) { state.logins++; return go('/apps', 'sessao=ok; Path=/; HttpOnly'); }
      return html(page('Portal — Login', '<p role="alert">Usuário ou senha inválidos.</p><a href="/login">Tentar de novo</a>'));
    }
    if (url.pathname === '/login' || !logged) {
      return html(page('Portal — Login', `<div class="card"><h1>Entrar</h1><form method="post" action="/login" aria-label="Login">
<label for="u">Usuário</label><input id="u" name="usuario" autocomplete="username">
<label for="p">Senha</label><input id="p" name="senha" type="password" autocomplete="current-password">
<br><button type="submit">Entrar</button></form></div>`));
    }
    if (url.pathname === '/apps') {
      return html(page('Portal — Micro-frontends', `<h1>Micro-frontends</h1><ul>${Object.entries(state.versions).map(([k, v]) => `<li><a href="/apps/${k}">${k}</a> — versão ${v}</li>`).join('')}</ul>`));
    }
    const m = url.pathname.match(/^\/apps\/([\w-]+)(\/config)?$/);
    if (m && state.versions[m[1]]) {
      const name = m[1];
      if (req.method === 'POST') { state.versions[name] = body?.get('versao') ?? state.versions[name]; return go(`/apps/${name}/config?salvo=1`); }
      const tab = m[2] ? 'config' : 'geral';
      const tabs = `<div role="tablist"><a role="tab" aria-selected="${tab === 'geral'}" href="/apps/${name}">Visão geral</a> <a role="tab" aria-selected="${tab === 'config'}" href="/apps/${name}/config">Configuração</a></div>`;
      const content = tab === 'geral'
        ? `<p>Versão publicada: <strong id="versao-atual">${state.versions[name]}</strong></p>`
        : `${url.searchParams.get('salvo') ? '<p role="status">Configuração salva.</p>' : ''}<form method="post" aria-label="Configuração do MFE"><label for="v">Versão</label><input id="v" name="versao" value="${state.versions[name]}"><br><button type="submit">Salvar</button></form>`;
      return html(page(`Portal — ${name}`, `<h1>${name}</h1><div class="card">${tabs}<section role="tabpanel"><h2>${tab === 'geral' ? 'Visão geral' : 'Configuração'}</h2>${content}</section></div><p><a href="/apps">Voltar</a></p>`));
    }
    res.writeHead(404).end('não encontrado');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    const p = typeof addr === 'object' && addr ? addr.port : port;
    resolve({ url: `http://127.0.0.1:${p}`, state, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

export const FAKE_PORTAL_CREDENTIALS = { user: 'arthur', password: 's3nh@-Portal!' };
