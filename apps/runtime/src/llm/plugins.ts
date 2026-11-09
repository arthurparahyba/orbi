import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { platformFor } from '../platform/index.ts';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { PLUGIN_API_VERSION, type OrbiPlugin } from '@orbi/plugin-sdk';

/**
 * Plugins: folders with code that implements a contract from @orbi/plugin-sdk,
 * found at start in the plugins directories. They live outside Orbi's code, so a
 * company can keep its LLM connection in its own repository and drop it in.
 *
 *   plugins/<pasta>/package.json   "main" points to the entry (optional)
 *   plugins/<pasta>/index.mjs      export default { kind: 'llm', name, apiVersion: 1, create }
 */

export interface PluginInfo {
  /** Name from the plugin (or the folder, when it failed to load). */
  name: string;
  kind: string;
  dir: string;
  description?: string;
  /** Why it could not be used. Absent when it loaded fine. */
  error?: string;
  plugin?: OrbiPlugin;
}

/**
 * The installed app's folder for the developer's own things (the same the desktop app uses:
 * Tauri's app data dir). Updating the app never touches it.
 */
export function appDataHome(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform, home = homedir()): string {
  return platformFor(platform).appDataHome(env, home);
}

/**
 * Where plugins are looked for: ORBI_PLUGINS_DIR (one or more, separated like PATH), else the
 * installed app's plugins folder (so a plugin dropped there serves `npm start` too), then
 * `plugins/` next to the working directory or at the repository root. With the same plugin
 * in two places, the first one wins.
 */
export function pluginDirs(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd(), appHome = appDataHome(env)): string[] {
  if (env.ORBI_PLUGINS_DIR) return env.ORBI_PLUGINS_DIR.split(delimiter).filter(Boolean).map((d) => resolve(cwd, d));
  return [join(appHome, 'plugins'), resolve(cwd, 'plugins'), resolve(cwd, '../../plugins')].filter((d, i, all) => all.indexOf(d) === i && existsSync(d));
}

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const canStripTypes = Boolean((process as { features?: { typescript?: unknown } }).features?.typescript);

/** The file a plugin folder starts from, or a reason it has none. */
function entryOf(dir: string): { file?: string; error?: string } {
  const pkgFile = join(dir, 'package.json');
  if (existsSync(pkgFile)) {
    try {
      const main = JSON.parse(readFileSync(pkgFile, 'utf8')).main;
      if (main) return existsSync(join(dir, main)) ? { file: join(dir, main) } : { error: `package.json aponta "main" para ${main}, que não existe` };
    } catch {
      return { error: 'package.json inválido' };
    }
  }
  for (const name of ['index.mjs', 'index.js', ...(canStripTypes ? ['index.ts'] : [])]) {
    if (existsSync(join(dir, name))) return { file: join(dir, name) };
  }
  if (existsSync(join(dir, 'index.ts'))) return { error: 'index.ts precisa de Node com suporte a TypeScript (≥ 22.18); use index.mjs ou compile para JavaScript' };
  return { error: 'sem index.mjs, index.js ou "main" no package.json' };
}

/** Checks the default export against the contract; returns a reason when it does not fit. */
export function validatePlugin(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return 'o arquivo não tem export default de um plugin';
  const p = value as Record<string, unknown>;
  if (p.kind !== 'llm') return `kind "${String(p.kind)}" não suportado (hoje: "llm")`;
  if (typeof p.name !== 'string' || !NAME.test(p.name)) return 'name deve ter letras minúsculas, números e hífens';
  if (p.apiVersion !== PLUGIN_API_VERSION) {
    return `escrito para a versão ${String(p.apiVersion)} do contrato; este Orbi usa a versão ${PLUGIN_API_VERSION}`;
  }
  if (typeof p.create !== 'function') return 'falta create(settings)';
  return undefined;
}

/** Every plugin folder in `dirs`, loaded and validated. One broken plugin never stops the others. */
export async function discoverPlugins(dirs: string[]): Promise<PluginInfo[]> {
  const found: PluginInfo[] = [];
  for (const root of dirs) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).sort()) {
      const dir = join(root, name);
      if (name.startsWith('.') || name === 'node_modules' || !statSync(dir).isDirectory()) continue;
      const { file, error } = entryOf(dir);
      if (!file) {
        found.push({ name, kind: '?', dir, error });
        continue;
      }
      try {
        const mod = await import(/* @vite-ignore */ pathToFileURL(file).href);
        const plugin = mod.default as OrbiPlugin;
        const problem = validatePlugin(plugin);
        if (problem) found.push({ name, kind: String((plugin as { kind?: unknown })?.kind ?? '?'), dir, error: problem });
        else found.push({ name: plugin.name, kind: plugin.kind, dir, description: plugin.description, plugin });
      } catch (err) {
        found.push({ name, kind: '?', dir, error: `falhou ao carregar: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }
  // Two plugins with the same name: the first directory wins, the other is flagged.
  const seen = new Set<string>();
  for (const p of found) {
    if (p.error) continue;
    if (seen.has(p.name)) {
      p.error = `nome repetido: outro plugin "${p.name}" foi carregado antes`;
      delete p.plugin;
    }
    seen.add(p.name);
  }
  return found;
}

/** Plugin list without the code, for /api/health and logs. */
export const describePlugins = (plugins: PluginInfo[]) => plugins.map(({ plugin: _p, ...info }) => info);
