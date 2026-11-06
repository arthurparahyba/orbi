#!/usr/bin/env node
// npm run plugin:new -- <nome>
// Creates plugins/<nome>/ from the template in packages/plugin-sdk/template.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];

if (!name || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) {
  console.log('Uso: npm run plugin:new -- <nome>   (letras minúsculas, números e hífens, ex.: gateway-empresa)');
  process.exit(1);
}
const dir = join(process.env.ORBI_PLUGINS_DIR ?? join(root, 'plugins'), name);
if (existsSync(dir)) {
  console.log(`Já existe: ${dir}`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

const fill = (text) => text.replaceAll('__NAME__', name);
writeFileSync(join(dir, 'index.mjs'), fill(readFileSync(join(root, 'packages/plugin-sdk/template/index.mjs'), 'utf8')));
writeFileSync(
  join(dir, 'package.json'),
  JSON.stringify({ name: `orbi-plugin-${name}`, version: '0.1.0', private: true, type: 'module', main: 'index.mjs' }, null, 2) + '\n',
);
writeFileSync(
  join(dir, 'README.md'),
  `# ${name}\n\nPlugin de LLM do Orbi.\n\n1. Implemente \`chat()\` em \`index.mjs\`.\n2. Em \`apps/runtime/.env\`: \`ORBI_LLM=${name}\` e as variáveis \`ORBI_LLM_*\` que ele usa.\n3. Teste contra o LLM real: \`npm run plugin:test -- ${name}\`.\n\nDependências próprias (um SDK interno, por exemplo): \`npm install <pacote>\` dentro desta pasta.\n`,
);

console.log(`Criado: ${dir}
Próximos passos:
  1. Implemente chat() em ${join(dir, 'index.mjs')}
  2. Em apps/runtime/.env: ORBI_LLM=${name} (e ORBI_LLM_MODEL, ORBI_LLM_BASE_URL… se usar)
  3. npm run plugin:test -- ${name}`);
