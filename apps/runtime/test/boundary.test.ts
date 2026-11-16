import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * A fronteira dos contextos (documento 26, mapa em `docs/modulos.md`).
 *
 * Um contexto é uma pasta de `src/contexts/`. Quem está fora só o alcança pelo `index.ts`;
 * nenhum contexto alcança o de dentro de outro. Enquanto a migração não termina, o que ainda
 * está na estrutura antiga aparece em `AINDA_FORA`: essa lista é o placar da migração e só
 * pode encurtar.
 */

const SRC = resolve(import.meta.dirname, '../src');
const CONTEXTS = join(SRC, 'contexts');

/**
 * O que qualquer contexto pode alcançar sempre: as peças da composição com que todo contexto
 * conversa. `services.ts` é o conjunto que a rota recebe e `http/errors.ts` é o formato de erro
 * da API — contrato, não funcionalidade de outro contexto. Esta lista não cresce sem discussão.
 */
const SEMPRE_PERMITIDO = ['services.ts', 'http/errors.ts'];

/**
 * Pastas que ainda não viraram contexto e que um contexto pode alcançar por enquanto.
 * É o placar da migração: só pode encurtar, e cada item diz em que fase sai.
 */
const AINDA_FORA: Record<string, string[]> = {
  // `terminal/` vira o contexto `tools` e `observability/`, o `telemetry` (fase 5).
  models: ['terminal/', 'observability/'],
  platform: [],
  secrets: [],
};

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.ts') ? [path] : [];
  });

const contexts = readdirSync(CONTEXTS).filter((n) => statSync(join(CONTEXTS, n)).isDirectory());

const importsOf = (file: string): string[] => {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/from\s+'([^']+)'/g)]
    .map((m) => m[1])
    .filter((spec) => spec.startsWith('.'))
    .map((spec) => relative(SRC, resolve(join(file, '..'), spec)));
};

test('há pelo menos um contexto', () => {
  assert.ok(contexts.length > 0, 'src/contexts/ está vazio');
});

test('de fora, um contexto só é alcançado pelo seu index.ts', () => {
  const outside = files(SRC).filter((f) => !f.startsWith(CONTEXTS + '/'));
  const quebras: string[] = [];
  for (const file of outside) {
    for (const target of importsOf(file)) {
      const m = /^contexts\/([^/]+)\/(.+)$/.exec(target);
      if (m && m[2] !== 'index.ts') quebras.push(`${relative(SRC, file)} → ${target}`);
    }
  }
  assert.deepEqual(quebras, [], `importe pelo index.ts do contexto:\n${quebras.join('\n')}`);
});

test('um contexto não alcança o de dentro de outro', () => {
  const quebras: string[] = [];
  for (const context of contexts) {
    for (const file of files(join(CONTEXTS, context))) {
      for (const target of importsOf(file)) {
        const m = /^contexts\/([^/]+)\/(.+)$/.exec(target);
        if (m && m[1] !== context && m[2] !== 'index.ts') quebras.push(`${relative(SRC, file)} → ${target}`);
      }
    }
  }
  assert.deepEqual(quebras, [], `importe pelo index.ts do vizinho:\n${quebras.join('\n')}`);
});

test('todo contexto migrado está declarado em AINDA_FORA', () => {
  const faltando = contexts.filter((c) => !(c in AINDA_FORA));
  assert.deepEqual(faltando, [], 'declare o contexto em AINDA_FORA (lista vazia, se ele já está limpo)');
});

test('um contexto só alcança a estrutura antiga pelo que está em AINDA_FORA', () => {
  const quebras: string[] = [];
  for (const context of contexts) {
    const allowed = AINDA_FORA[context] ?? [];
    for (const file of files(join(CONTEXTS, context))) {
      for (const target of importsOf(file)) {
        if (target.startsWith('contexts/')) continue;
        if ([...SEMPRE_PERMITIDO, ...allowed].some((prefix) => target === prefix || target.startsWith(prefix))) continue;
        quebras.push(`${relative(SRC, file)} → ${target}`);
      }
    }
  }
  assert.deepEqual(quebras, [], `peça pelo index.ts ou declare em AINDA_FORA:\n${quebras.join('\n')}`);
});

test('o index.ts do contexto não reexporta arquivo de dentro de outro contexto', () => {
  for (const context of contexts) {
    const index = join(CONTEXTS, context, 'index.ts');
    for (const target of importsOf(index)) {
      assert.ok(
        !target.startsWith('contexts/') || target.startsWith(`contexts/${context}/`),
        `${context}/index.ts reexporta ${target}`,
      );
    }
  }
});
