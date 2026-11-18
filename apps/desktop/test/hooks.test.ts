import { describe, expect, it } from 'vitest';

/**
 * Hook chamado depois de um `return` que sai mais cedo.
 *
 * É o erro que deixou a tela preta no computador do trabalho: o `App` mostra o Splash enquanto o
 * runtime não responde (um `return` no meio do corpo) e os hooks do arrastar-arquivo estavam
 * **abaixo** dele. Enquanto o Splash aparecia rodavam 8 hooks; quando o runtime respondeu, 12 — e
 * o React derruba a árvore inteira quando a quantidade muda entre dois renders. A tela não mostra
 * erro: fica preta.
 *
 * Nenhum teste pegava isso porque nenhum renderiza o `App` passando pelo Splash. Este não
 * renderiza nada: lê o código e procura a forma do erro, o que é mais barato e vale para todo
 * componente, não só para o que eu lembrar de testar.
 *
 * A conta é por indentação, como o resto da casa: componente na coluna 0, corpo em 2 espaços. Só
 * conta o hook em 2 espaços — o que está mais fundo é de uma função de dentro, que tem a ordem
 * dela.
 */

const BODY = 2;
/** Todo componente do app, como texto. O Vite lê os arquivos; aqui não entra nada de Node. */
const SOURCES = import.meta.glob('../src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const starts = (line: string) => /^(?:export )?function [A-Z]/.test(line) || /^(?:export )?const [A-Z]\w* = \(/.test(line);
const atBody = (line: string) => line.startsWith(' '.repeat(BODY)) && !line.startsWith(' '.repeat(BODY + 1));
/** Um `return` que sai mais cedo: `return` cru, ou dentro de um `if` de uma linha. */
const earlyReturn = (line: string) => atBody(line) && /^\s+(return\b|if \(.*\) return\b)/.test(line);
const hookCall = (line: string) => atBody(line) && /\buse[A-Z]\w*\(/.test(line);

/** Os hooks que um componente chama depois do primeiro `return` do corpo dele. */
export function lateHooks(code: string): string[] {
  const lines = code.split('\n');
  const late: string[] = [];
  let component: string | undefined;
  let seenReturn = false;
  for (const line of lines) {
    if (starts(line)) {
      component = line.replace(/^(?:export )?(?:function|const) /, '').split(/[ (<]/)[0];
      seenReturn = false;
      continue;
    }
    if (!component) continue;
    if (line === '}') { component = undefined; continue; }
    if (earlyReturn(line)) { seenReturn = true; continue; }
    if (seenReturn && hookCall(line)) late.push(`${component} chama ${/\b(use[A-Z]\w*)\(/.exec(line)![1]}() depois de um return`);
  }
  return late;
}

describe('ordem dos hooks', () => {
  it('nenhum componente chama hook depois de um return que sai mais cedo', () => {
    const bad = Object.entries(SOURCES).flatMap(([file, code]) => lateHooks(code).map((m) => `${file.replace('../', '')} · ${m}`));
    expect(bad, 'o React derruba a árvore quando a quantidade de hooks muda entre dois renders, e a tela fica preta. Suba o hook para antes de todo return.').toEqual([]);
  });

  it('a conta pega a forma do erro, e não pega o hook de uma função de dentro', () => {
    const quebrado = ['export function App() {', '  const a = useState(1);', '  if (!pronto) return <Splash />;', '  const [b] = useState(2);', '  return <div />;', '}'].join('\n');
    expect(lateHooks(quebrado)).toEqual(['App chama useState() depois de um return']);

    const certo = ['export function App() {', '  const a = useState(1);', '  const [b] = useState(2);', '  if (!pronto) return <Splash />;', '  return <div />;', '}'].join('\n');
    expect(lateHooks(certo)).toEqual([]);

    // Hook dentro de uma função de dentro, depois de um return: outra ordem, não é erro.
    const dentro = ['export function App() {', '  if (!pronto) return <Splash />;', '  const f = () => {', '    const x = useRef(1);', '  };', '  return <div />;', '}'].join('\n');
    expect(lateHooks(dentro)).toEqual([]);
  });
});
