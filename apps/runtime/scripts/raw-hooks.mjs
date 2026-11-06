// Node module hooks: `import text from './x.md?raw'` gives the file's text, as Vite does in
// the build. Registered by scripts/register-raw.mjs for tests and tsx scripts.
import { readFile } from 'node:fs/promises';

export async function resolve(specifier, context, next) {
  if (specifier.endsWith('?raw') && context.parentURL) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith('?raw')) {
    const text = await readFile(new URL(url.slice(0, -'?raw'.length)), 'utf8');
    return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  return next(url, context);
}
