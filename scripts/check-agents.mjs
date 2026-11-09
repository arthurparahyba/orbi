// Prints how many times each agent is in the runtime bundle. Two copies of one agent (paths
// spelled differently on Windows) make dispatch() refuse the copy app.ts imported; the runtime
// works around it (agents/runtime-port.ts, registeredAgent), and this shows when it happens.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '..', 'apps', 'runtime', 'dist');
const counts = {};
for (const f of readdirSync(dist).filter((n) => n.endsWith('.mjs'))) {
  for (const m of readFileSync(join(dist, f), 'utf8').matchAll(/agentName = "([a-z0-9-]+)"/g)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
}
console.log('agentes no bundle:', JSON.stringify(counts));
const twice = Object.entries(counts).filter(([, n]) => n > 1).map(([a]) => a);
if (twice.length) console.log(`::warning::agente duas vezes no bundle: ${twice.join(', ')} (o runtime usa a cópia registrada)`);
