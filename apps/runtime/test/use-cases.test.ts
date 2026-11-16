import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * A camada de casos de uso (documento 27). Um caso de uso é uma funcionalidade do contexto
 * escrita em chamadas: recebe o pedido, chama os vizinhos pela porta deles e devolve o que
 * aconteceu.
 *
 * O que ele não faz é o que o mantém legível, e é o que estes testes guardam: nada de SQL, nada
 * de schema de ferramenta, nada do runtime de agentes, nada de repositório, e nada de falar com
 * a conversa ou com a tela. Se um caso de uso precisa disso, ou ele é um serviço, ou quem chama
 * é que tem de fazer.
 */

const SRC = resolve(import.meta.dirname, '../src');
const CONTEXTS = join(SRC, 'contexts');

/** Importar isto de dentro de `use-cases/` quer dizer que a orquestração virou implementação. */
const PROIBIDO: Array<{ what: RegExp; why: string }> = [
  { what: /node:sqlite/, why: 'banco: isso é de um repositório do contexto' },
  { what: /\/db\//, why: 'banco: isso é de um repositório do contexto' },
  { what: /valibot/, why: 'schema de ferramenta: isso é do handler' },
  { what: /@flue\//, why: 'runtime de agentes: isso é do handler' },
  { what: /runtime-port/, why: 'runtime de agentes: isso é do handler' },
  { what: /\/agents\//, why: 'composição: um contexto não alcança o agente' },
  { what: /\/repo\.ts$|\/[a-z-]*-repo\.ts$|calls-repo/, why: 'repositório: o fluxo pede ao serviço' },
  { what: /\/prompt\.ts$|prompts\//, why: 'texto de prompt: isso é do handler' },
];

/** Falar com o mundo é de quem chama: o caso de uso devolve o que aconteceu. */
const NAO_FALA = [
  { what: /\bctx\./, why: 'a conversa é de quem chama' },
  { what: /\.ui\(/, why: 'a tela é de quem chama' },
  { what: /tellAgent\(/, why: 'avisar a conversa é de quem chama' },
];

const useCaseFiles = (): string[] => {
  if (!statSync(CONTEXTS, { throwIfNoEntry: false })) return [];
  return readdirSync(CONTEXTS).flatMap((context) => {
    const dir = join(CONTEXTS, context, 'use-cases');
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
    return readdirSync(dir).filter((n) => n.endsWith('.ts')).map((n) => join(dir, n));
  });
};

test('há casos de uso', () => {
  assert.ok(useCaseFiles().length > 0, 'nenhum contexto tem use-cases/ ainda');
});

test('um caso de uso não importa implementação', () => {
  const quebras: string[] = [];
  for (const file of useCaseFiles()) {
    for (const spec of [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!)) {
      for (const { what, why } of PROIBIDO) {
        if (what.test(spec)) quebras.push(`${relative(SRC, file)} → ${spec} (${why})`);
      }
    }
  }
  assert.deepEqual(quebras, [], `caso de uso importando implementação:\n${quebras.join('\n')}`);
});

test('um caso de uso não fala com a conversa nem com a tela', () => {
  const quebras: string[] = [];
  for (const file of useCaseFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const { what, why } of NAO_FALA) {
      if (what.test(text)) quebras.push(`${relative(SRC, file)}: ${what.source} (${why})`);
    }
  }
  assert.deepEqual(quebras, [], `caso de uso falando com o mundo:\n${quebras.join('\n')}`);
});

test('um caso de uso é curto: passou de 25 linhas de corpo, tem comportamento escondido ou são dois', () => {
  const longos: string[] = [];
  for (const file of useCaseFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const fn of text.split(/\nexport (?:function|const) /).slice(1)) {
      const body = fn.split('\n').filter((l) => {
        const t = l.trim();
        return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      });
      const name = fn.slice(0, fn.search(/[(:<]/));
      if (body.length > 25) longos.push(`${relative(SRC, file)}: ${name} com ${body.length} linhas`);
    }
  }
  assert.deepEqual(longos, [], `caso de uso longo demais:\n${longos.join('\n')}`);
});

test('todo caso de uso é exportado pelo index.ts do seu contexto', () => {
  const faltando: string[] = [];
  for (const file of useCaseFiles()) {
    const context = relative(CONTEXTS, file).split('/')[0]!;
    const index = readFileSync(join(CONTEXTS, context, 'index.ts'), 'utf8');
    const name = file.slice(file.lastIndexOf('/') + 1);
    if (!index.includes(`use-cases/${name}`)) faltando.push(`${context}/use-cases/${name}`);
  }
  assert.deepEqual(faltando, [], `caso de uso que ninguém de fora alcança:\n${faltando.join('\n')}`);
});
