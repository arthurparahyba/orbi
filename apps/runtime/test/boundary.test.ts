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
 * O que qualquer contexto pode alcançar sempre: a linguagem compartilhada (`language/`, só
 * tipos e constantes, que não importa contexto nenhum) e as peças da composição com que todo
 * contexto conversa: `services.ts`, o conjunto que a rota recebe, `http/errors.ts` e
 * `http/routes/types.ts`, o formato da API, e `db/{database,rows}.ts`, a conexão e os ajudantes
 * de linha. Contrato e encanamento, não funcionalidade de outro contexto. Não cresce sem discussão.
 */
const SEMPRE_PERMITIDO = [
  'language/',              // o vocabulário: só tipos e constantes, importa contexto nenhum
  'services.ts',            // o conjunto de serviços que a rota recebe
  'config.ts',              // a forma da configuração da instalação
  'version.ts',             // a versão do app
  'events.ts',              // o barramento de eventos da interface
  'db/database.ts',         // a conexão e a transação
  'db/rows.ts',             // os ajudantes de linha do SQLite
  'http/errors.ts',         // o formato de erro da API
  'http/routes/types.ts',   // a forma de uma rota
  'agents/runtime-port.ts', // o contrato com o runtime de agentes (Flue)
  'agents/directory.ts',    // para qual agente vai uma conversa
];

/**
 * Pastas que ainda não viraram contexto e que um contexto pode alcançar por enquanto. Era o
 * placar da migração e **zerou na fase 5**: todo contexto agora conversa só pela porta do
 * vizinho. Se uma entrada voltar a aparecer aqui, é uma fronteira sendo furada, não um atalho.
 */
const AINDA_FORA: Record<string, string[]> = {
  knowledge: [],
  procedures: [],
  learning: [],
  trust: [],
  improvement: [],
  talk: [],
  tools: [],
  telemetry: [],
  models: [],
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

/**
 * Cada tabela tem um dono (documento 26). O dono é quem a nomeia em SQL: um contexto, ou a
 * composição. Duas pastas tocando a mesma tabela é a fronteira sendo furada — o vizinho tem de
 * pedir pelo `index.ts`. `db/` fica de fora: é o runner das migrações, que vê todas.
 */
const TABELAS = `types entities edges playbooks playbook_runs proposals followups inbox_items
  conversations settings usage agent_clients agent_requests agent_suggestions
  deleted_conversations pipelines pipeline_runs playbook_known_actions autonomy_events
  code_agents code_agent_tasks review_notes mcp_servers mcp_tools playbook_learnings run_calls
  playbook_proofs diagnoses diagnosis_reports`.split(/\s+/);

test('cada tabela tem um dono só', () => {
  const owners = new Map<string, Set<string>>();
  for (const file of files(SRC)) {
    const rel = relative(SRC, file);
    if (rel.startsWith('db/')) continue;
    const text = readFileSync(file, 'utf8');
    const who = /^contexts\/([^/]+)\//.exec(rel)?.[1] ?? 'composição';
    for (const table of TABELAS) {
      if (new RegExp(`\\b(FROM|INTO|UPDATE|JOIN|TABLE)\\s+${table}\\b`).test(text)) {
        (owners.get(table) ?? owners.set(table, new Set()).get(table)!).add(who);
      }
    }
  }
  const shared = [...owners].filter(([, who]) => who.size > 1).map(([table, who]) => `${table}: ${[...who].join(', ')}`);
  assert.deepEqual(shared, [], `tabela com mais de um dono:\n${shared.join('\n')}`);
});
