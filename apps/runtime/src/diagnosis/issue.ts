/**
 * A defect of the Orbi, written as an issue for its own repository (docs/funcionalidades/24).
 *
 * **Nada do trabalho do desenvolvedor sai daqui.** O texto é montado só do que o registro da
 * execução guarda (ferramenta, tamanho, erro) e os nomes que são dele — procedimento, passos,
 * arquivos, sites — são trocados por `<procedimento-1>`, `<passo-2>`, `<arquivo-1>`, `<site-1>`
 * antes de qualquer coisa. A troca é por nome conhecido, nunca por adivinhação: o que não é
 * reconhecido não é mandado. Regras puras.
 */
import type { RunCall } from '../brain/domain/run-calls.ts';
import type { Diagnosis } from './index.ts';

export interface Swap {
  from: string;
  to: string;
}

export interface IssueDraft {
  title: string;
  body: string;
  /** O que foi trocado antes de sair, para você ver na tela. */
  swaps: Swap[];
  fingerprint: string;
}

export interface IssueContext {
  run: { playbook: string; steps: ReadonlyArray<{ id: string; label: string }> };
  calls: readonly RunCall[];
  /** Versão do Orbi e sistema, para quem for corrigir. */
  version: string;
  platform: string;
}

const PATH = /(?:[\w.~-]+\/)*[\w~-]+\.[A-Za-z0-9]{1,8}/g;
const HOST = /\bhttps?:\/\/([^/\s"')]+)/g;

/** Os nomes que são do desenvolvedor, com o apelido que cada um recebe. */
export function swapsFor(ctx: IssueContext): Swap[] {
  const out: Swap[] = [{ from: ctx.run.playbook, to: '<procedimento-1>' }];
  ctx.run.steps.forEach((s, i) => {
    out.push({ from: s.label, to: `<passo-${i + 1}>` });
    if (s.id !== s.label) out.push({ from: s.id, to: `<passo-${i + 1}>` });
  });
  const files = new Map<string, string>();
  const hosts = new Map<string, string>();
  for (const c of ctx.calls) {
    for (const url of c.summary.matchAll(HOST)) if (!hosts.has(url[1]!)) hosts.set(url[1]!, `<site-${hosts.size + 1}>`);
    // Fora dos endereços: dentro deles o que parece arquivo é parte do site (www.amazon.com.br).
    for (const file of c.summary.replace(HOST, ' ').match(PATH) ?? []) if (!files.has(file)) files.set(file, `<arquivo-${files.size + 1}>`);
  }
  for (const [from, to] of [...files, ...hosts]) out.push({ from, to });
  // O nome mais longo primeiro: trocar "promo" antes de "promo-livros" deixaria o resto para trás.
  return out.filter((s) => s.from.length >= 3).sort((a, b) => b.from.length - a.from.length);
}

/** Troca os nomes do desenvolvedor e diz quais foram usados. */
export function anonymize(text: string, swaps: readonly Swap[]): { text: string; used: Swap[] } {
  let out = text;
  const used: Swap[] = [];
  for (const s of swaps) {
    if (!out.includes(s.from)) continue;
    out = out.split(s.from).join(s.to);
    used.push(s);
  }
  return { text: out, used };
}

const SIZE = (chars: number) => (chars >= 1000 ? `${Math.round(chars / 1000)} mil caracteres` : `${chars} caracteres`);

/** A issue de um achado do diagnóstico: título, corpo e o que foi trocado. */
export function draftIssue(d: Diagnosis, ctx: IssueContext): IssueDraft {
  const swaps = swapsFor(ctx);
  const used: Swap[] = [];
  const hide = (text: string) => {
    const done = anonymize(text, swaps);
    for (const s of done.used) if (!used.some((u) => u.from === s.from)) used.push(s);
    return done.text;
  };
  const title = hide(d.title);
  // Só as chamadas do passo em que aconteceu, para quem for corrigir ver a sequência.
  const trail = ctx.calls
    .filter((c) => c.step === d.step)
    .slice(-6)
    .map((c) => `- ${c.tool}${c.summary ? ` ${hide(c.summary)}` : ''} → ${c.status}${c.chars ? ` · ${SIZE(c.chars)} ao modelo` : ''}${c.marks.length ? ` [${c.marks.join(', ')}]` : ''}${c.error ? `\n  erro: ${hide(c.error)}` : ''}`);
  const body = [
    '## O que aconteceu',
    hide(d.detail),
    ...(d.hint ? ['', '## Onde olhar', d.hint] : []),
    ...(trail.length ? ['', '## O registro desta execução, no passo em que aconteceu', ...trail] : []),
    '',
    '## Ambiente',
    `- Orbi ${ctx.version} · ${ctx.platform}`,
    `- detector \`${d.detector}\` · categoria ${d.category}`,
    `- impressão digital \`${d.fingerprint}\` · ocorrências nesta máquina: ${d.times}`,
    '',
    'Nada do trabalho do desenvolvedor vai nesta issue: nomes de procedimento, passo, arquivo e site',
    'foram trocados, e o conteúdo das respostas nunca é guardado pelo Orbi.',
  ].join('\n');
  return { title: `${title} (${d.detector})`, body, swaps: used, fingerprint: d.fingerprint };
}

/** A página do GitHub já preenchida: o desenvolvedor confere e clica em enviar lá. */
export function issueUrl(repo: string, draft: IssueDraft): string {
  const q = new URLSearchParams({ title: draft.title, body: draft.body, labels: 'diagnóstico' });
  return `https://github.com/${repo}/issues/new?${q}`;
}
