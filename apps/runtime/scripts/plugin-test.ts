/**
 * npm run plugin:test -- <nome> [--model <id>]
 *
 * Loads the plugin from the plugins folder with the ORBI_LLM_* settings of
 * apps/runtime/.env and checks it against the real model: plain text, a tool
 * call, and an answer after a tool result.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkAdapter } from '../src/llm/plugin-check.ts';
import { discoverPlugins, pluginDirs } from '../src/llm/plugins.ts';
import { llmSettings } from '../src/llm/index.ts';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const modelFlag = args.indexOf('--model');
const model = modelFlag >= 0 ? args[modelFlag + 1] : undefined;

if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'));
const dirs = pluginDirs();
const plugins = await discoverPlugins(dirs);

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

if (!name) {
  console.log(`Uso: npm run plugin:test -- <nome> [--model <id>]\n\nPastas de plugins: ${dirs.join(', ') || '(nenhuma encontrada)'}`);
  for (const p of plugins) console.log(`  ${p.error ? red('✘') : green('✔')} ${p.name} ${dim(p.error ?? p.description ?? '')}`);
  process.exit(1);
}

const info = plugins.find((p) => p.name === name) ?? plugins.find((p) => p.dir.endsWith(`/${name}`));
if (!info) {
  console.error(red(`Plugin "${name}" não encontrado em ${dirs.join(', ') || '(nenhuma pasta de plugins)'}.`));
  process.exit(1);
}
if (!info.plugin) {
  console.error(red(`Plugin "${name}" (${info.dir}) não pôde ser carregado: ${info.error}`));
  process.exit(1);
}

console.log(`Plugin ${info.name} — ${info.dir}`);
const settings = llmSettings();
if (model) settings.model = model;
let adapter;
try {
  adapter = await info.plugin.create(settings);
} catch (error) {
  console.error(red(`create(settings) falhou: ${error instanceof Error ? error.message : String(error)}`));
  console.error(dim('Confira as variáveis ORBI_LLM_* em apps/runtime/.env.'));
  process.exit(1);
}

const results = await checkAdapter(adapter, { model: settings.model });
for (const r of results) {
  console.log(`${r.ok ? green('✔') : red('✘')} ${r.name} ${dim(`${r.ms} ms`)}\n    ${r.detail}${r.hint ? `\n    ${dim(r.hint)}` : ''}`);
}
const failed = results.filter((r) => !r.ok).length;
if (failed) {
  console.log(red(`\n${failed} verificação(ões) falharam.`));
  process.exit(1);
}
console.log(green(`\nTudo certo. Para usar: ORBI_LLM=${info.name} no .env e npm start.`));
