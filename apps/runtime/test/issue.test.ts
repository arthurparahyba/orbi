import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymize, draftIssue, issueUrl, swapsFor, type IssueContext } from '../src/diagnosis/issue.ts';
import type { Diagnosis } from '../src/diagnosis/index.ts';

/** A issue de um defeito do Orbi (docs/funcionalidades/24): nada do trabalho do desenvolvedor sai. */
const ctx: IssueContext = {
  run: { playbook: 'consultar-promocoes-livros', steps: [{ id: 'abrir', label: 'Abrir o site' }, { id: 'extrair', label: 'Extrair produtos' }] },
  calls: [
    { id: 'c1', runId: 'r1', conversationId: 'x', step: 'extrair', tool: 'browser_act', summary: 'evaluate_script · saveTo=saida/livros/promo_pagina_1.json', status: 'ok', approval: 'aprovada', error: '', durationMs: 2400, chars: 30_012, marks: ['cortado'], at: '2026-11-14T21:17:03Z' },
    { id: 'c2', runId: 'r1', conversationId: 'x', step: 'extrair', tool: 'run_script', summary: 'gerar_html.py', status: 'erro', approval: null, error: 'JSONDecodeError ao ler saida/livros/promo_pagina_1.json', durationMs: 120, chars: 60, marks: [], at: '2026-11-14T21:18:00Z' },
    { id: 'c3', runId: 'r1', conversationId: 'x', step: 'abrir', tool: 'mcp__chrome__navigate_page', summary: 'url=https://www.amazon.com.br/livros', status: 'ok', approval: null, error: '', durationMs: 900, chars: 400, marks: [], at: '2026-11-14T21:10:00Z' },
  ],
  version: '0.23.1',
  platform: 'win32 x64',
};
const diag: Diagnosis = {
  id: 'd1', runId: 'r1', playbook: 'consultar-promocoes-livros', detector: 'arquivo-cortado', category: 'orbi',
  title: 'o arquivo gravado pode estar cortado', detail: 'browser_act gravou um arquivo (evaluate_script · saveTo=saida/livros/promo_pagina_1.json) com a resposta cortada: 30012 caracteres. O passo Extrair produtos de consultar-promocoes-livros pode falhar.',
  hint: 'browser/mcp/chrome-devtools.ts e agents/tools/browser.ts', step: 'extrair', fingerprint: 'arquivo-cortado:browser_act',
  times: 2, status: 'open', at: '2026-11-14T21:20:00Z',
};

test('a troca pega procedimento, passos, arquivos e sites, e o nome mais longo primeiro', () => {
  const swaps = swapsFor(ctx);
  assert.deepEqual(
    swaps.filter((s) => s.to.startsWith('<arquivo') || s.to.startsWith('<site')).map((s) => [s.from, s.to]),
    [['saida/livros/promo_pagina_1.json', '<arquivo-1>'], ['www.amazon.com.br', '<site-1>'], ['gerar_html.py', '<arquivo-2>']],
  );
  assert.deepEqual(swaps.map((s) => s.to).slice(0, 3), ['<arquivo-1>', '<procedimento-1>', '<site-1>'], 'o nome mais longo primeiro');
  const done = anonymize('o passo Extrair produtos de consultar-promocoes-livros leu saida/livros/promo_pagina_1.json', swaps);
  assert.equal(done.text, 'o passo <passo-2> de <procedimento-1> leu <arquivo-1>');
});

test('a issue sai com os números do registro e sem nada do trabalho do desenvolvedor', () => {
  const draft = draftIssue(diag, ctx);
  assert.equal(draft.title, 'o arquivo gravado pode estar cortado (arquivo-cortado)');
  assert.doesNotMatch(`${draft.title}\n${draft.body}`, /amazon|livros|promo_pagina|gerar_html|Extrair produtos|consultar-promocoes/i, 'nada do trabalho dele');
  assert.match(draft.body, /## O que aconteceu\nbrowser_act gravou um arquivo \(evaluate_script · saveTo=<arquivo-1>\) com a resposta cortada: 30012 caracteres/);
  assert.match(draft.body, /O passo <passo-2> de <procedimento-1> pode falhar/);
  assert.match(draft.body, /## Onde olhar\nbrowser\/mcp\/chrome-devtools\.ts/);
  // Só as chamadas do passo em que aconteceu, com o que o registro sabe.
  assert.match(draft.body, /- browser_act evaluate_script · saveTo=<arquivo-1> → ok · 30 mil caracteres ao modelo \[cortado\]/);
  assert.match(draft.body, /- run_script <arquivo-2> → erro · 60 caracteres ao modelo\n {2}erro: JSONDecodeError ao ler <arquivo-1>/);
  assert.doesNotMatch(draft.body, /navigate_page/, 'chamada de outro passo não entra');
  assert.match(draft.body, /- Orbi 0\.23\.1 · win32 x64/);
  assert.match(draft.body, /impressão digital `arquivo-cortado:browser_act` · ocorrências nesta máquina: 2/);
  assert.deepEqual(draft.swaps.map((s) => s.to), ['<arquivo-1>', '<arquivo-2>', '<procedimento-1>', '<passo-2>'], 'só o que apareceu no texto é listado');
});

test('sem o gh, a página do GitHub já vem preenchida', () => {
  const url = new URL(issueUrl('arthurparahyba/orbi', draftIssue(diag, ctx)));
  assert.equal(url.pathname, '/arthurparahyba/orbi/issues/new');
  assert.match(url.searchParams.get('title')!, /^o arquivo gravado pode estar cortado/);
  assert.match(url.searchParams.get('body')!, /## O que aconteceu/);
  assert.equal(url.searchParams.get('labels'), 'diagnóstico');
});

test('enviar: pelo gh quando ele existe; a mesma impressão digital entra como ocorrência', async () => {
  const { sendIssue } = await import('../src/diagnosis/send.ts');
  const draft = draftIssue(diag, ctx);
  const seen: string[][] = [];
  const gh = (out: Record<string, string>) => async (args: readonly string[]) => {
    seen.push([...args]);
    return { exitCode: 0, stdout: out[args[1]!] ?? '', stderr: '' };
  };
  // Nenhuma issue com esta impressão digital: abre uma.
  const made = await sendIssue('o/orbi', draft, gh({ list: '[]', create: 'https://github.com/o/orbi/issues/7\n' }));
  assert.deepEqual(made, { via: 'gh', url: 'https://github.com/o/orbi/issues/7' });
  assert.ok(seen[0]!.includes('--search') && seen[0]!.includes(draft.fingerprint), 'procura pela impressão digital');
  // Já existe: comenta nela em vez de abrir outra.
  seen.length = 0;
  const again = await sendIssue('o/orbi', draft, gh({ list: '[{"number":7,"url":"https://github.com/o/orbi/issues/7"}]', comment: 'https://github.com/o/orbi/issues/7#issuecomment-1' }));
  assert.equal(again.commented, true);
  assert.equal(again.via, 'gh');
  assert.deepEqual(seen[1]!.slice(0, 3), ['issue', 'comment', '7']);
  assert.match(seen[1]!.at(-1)!, /^Aconteceu de novo\./);
});

test('enviar: sem o gh, ou com o gh deslogado, volta a página do GitHub preenchida com o motivo', async () => {
  const { sendIssue } = await import('../src/diagnosis/send.ts');
  const { CommandNotFoundError } = await import('../src/terminal/exec.ts');
  const draft = draftIssue(diag, ctx);
  const missing = await sendIssue('o/orbi', draft, () => Promise.reject(new CommandNotFoundError('`gh` não está instalado')));
  assert.equal(missing.via, 'browser');
  assert.match(missing.url, /^https:\/\/github\.com\/o\/orbi\/issues\/new\?/);
  assert.match(missing.why!, /não está instalado nesta máquina/);
  const loggedOut = await sendIssue('o/orbi', draft, () => Promise.resolve({ exitCode: 1, stdout: '', stderr: 'gh: To get started with GitHub CLI, please run: gh auth login' }));
  assert.equal(loggedOut.via, 'browser');
  assert.match(loggedOut.why!, /não está logado.*gh auth login/);
});
