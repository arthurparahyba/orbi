import { createServer, type Server } from 'node:http';

/**
 * A tiny shop for the behavior evaluation (scripts/eval): departments, categories with
 * names that are not the obvious ones ("Impressoras e multifuncionais"), products with a
 * price and an offer badge, an age range in the toys, and a search. Local, reproducible,
 * nothing to block automation. `broken` renames the offer badge ("Desconto" instead of
 * "Oferta"), to see whether the Orbi notices instead of handing over an empty list.
 */
export interface FakeStore { url: string; close(): Promise<void> }

interface Product { id: string; name: string; price: number; was?: number; ages?: string }
interface Category { slug: string; name: string; products: Product[] }
interface Department { slug: string; name: string; categories: Category[] }

export const STORE: Department[] = [
  {
    slug: 'informatica', name: 'Informática e acessórios', categories: [
      { slug: 'perifericos', name: 'Periféricos', products: [
        { id: 'p1', name: 'Mouse sem fio Orion', price: 59.9, was: 89.9 },
        { id: 'p2', name: 'Teclado mecânico Atlas', price: 249.0 },
        { id: 'p3', name: 'Webcam Full HD Lince', price: 179.9, was: 229.9 },
      ] },
      { slug: 'computadores', name: 'Computadores e notebooks', products: [
        { id: 'c1', name: 'Notebook Vega 14"', price: 3299.0, was: 3899.0 },
        { id: 'c2', name: 'Desktop Polaris i5', price: 2899.0 },
        { id: 'c3', name: 'Notebook Sirius 15"', price: 4199.0, was: 4599.0 },
      ] },
      { slug: 'impressao', name: 'Impressoras e multifuncionais', products: [
        { id: 'i1', name: 'Multifuncional Tinta Cometa', price: 699.0, was: 849.0 },
        { id: 'i2', name: 'Impressora Laser Nebula', price: 1199.0 },
      ] },
    ],
  },
  {
    slug: 'brinquedos', name: 'Brinquedos', categories: [
      { slug: 'educativos', name: 'Educativos', products: [
        { id: 'b1', name: 'Blocos de montar 120 peças', price: 89.9, was: 129.9, ages: '4 a 8 anos' },
        { id: 'b2', name: 'Quebra-cabeça do mapa', price: 49.9, ages: '6 a 10 anos' },
        { id: 'b3', name: 'Kit de ciências mirim', price: 119.9, was: 159.9, ages: '8 a 12 anos' },
        { id: 'b4', name: 'Chocalho colorido', price: 29.9, was: 39.9, ages: '0 a 2 anos' },
      ] },
    ],
  },
];

const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const page = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:15px system-ui;margin:0;background:#fafafa;color:#222}header{background:#1f3a5f;color:#fff;padding:12px 24px}header a{color:#fff}
main{padding:24px;max-width:820px}nav a{margin-right:12px}ul{padding-left:18px}li{margin:8px 0}.badge{background:#d33;color:#fff;border-radius:4px;padding:1px 6px;font-size:12px;margin-left:6px}
s{color:#888;margin-right:6px}</style></head><body><header><a href="/">Loja Exemplo</a></header><main>${body}</main></body></html>`;

function productLine(p: Product, badge: string): string {
  const offer = p.was ? `<s>${money(p.was)}</s>` : '';
  return `<li data-produto="${p.id}"><strong>${esc(p.name)}</strong> — ${offer}<span class="preco">${money(p.price)}</span>${p.was ? `<span class="badge">${badge}</span>` : ''}${p.ages ? ` <span class="idade">Idade: ${esc(p.ages)}</span>` : ''}</li>`;
}

export function startFakeStore(options: { port?: number; broken?: boolean } = {}): Promise<FakeStore> {
  const badge = options.broken ? 'Desconto' : 'Oferta';
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const html = (s: string, status = 200) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(s);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return html(page('Loja Exemplo', `<h1>Departamentos</h1><nav>${STORE.map((d) => `<a href="/d/${d.slug}">${esc(d.name)}</a>`).join('')}</nav>
<form action="/busca"><label>Buscar <input name="q"></label> <button>Buscar</button></form>`));
    }
    if (parts[0] === 'busca') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const found = STORE.flatMap((d) => d.categories.flatMap((c) => c.products.filter((p) => p.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))));
      return html(page(`Busca: ${q}`, `<h1>Resultados para “${esc(q)}”</h1><ul>${found.map((p) => productLine(p, badge)).join('') || '<li>Nada encontrado.</li>'}</ul>`));
    }
    const dep = parts[0] === 'd' ? STORE.find((d) => d.slug === parts[1]) : undefined;
    if (dep && parts.length === 2) {
      return html(page(dep.name, `<h1>${esc(dep.name)}</h1><ul>${dep.categories.map((c) => `<li><a href="/d/${dep.slug}/${c.slug}">${esc(c.name)}</a></li>`).join('')}</ul>`));
    }
    const cat = dep?.categories.find((c) => c.slug === parts[2]);
    if (dep && cat) {
      const onlyOffers = url.searchParams.get('filtro') === 'ofertas';
      const items = onlyOffers ? cat.products.filter((p) => p.was) : cat.products;
      return html(page(cat.name, `<h1>${esc(cat.name)}</h1><p><a href="?filtro=ofertas">Só ${badge.toLowerCase()}s</a> · <a href="?">Todos</a></p><ul>${items.map((p) => productLine(p, badge)).join('')}</ul>`));
    }
    return html(page('Não encontrado', '<p>Página não encontrada.</p>'), 404);
  });
  return new Promise((resolveStart) => {
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolveStart({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
