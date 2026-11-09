import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { depsFor } from '../src/agents/capability.ts';
import { CAPABILITIES } from '../src/agents/capabilities.ts';

// A6: a capability gets only what it declared.
test('depsFor entrega só as peças declaradas', () => {
  const all = { brain: 'b', inbox: 'i', vault: 'v' } as never;
  assert.deepEqual(depsFor(all, ['brain', 'inbox'] as never), { brain: 'b', inbox: 'i' });
});

test('capacidades têm nomes únicos e declaram o que usam', () => {
  const names = CAPABILITIES.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const c of CAPABILITIES) assert.ok(c.needs.length > 0, c.name);
});

test('dentro de agents/ e terminal/, só o agente lê services()', () => {
  const src = join(import.meta.dirname, '..', 'src');
  const files = (readdirSync(src, { recursive: true }) as string[]).map((f) => f.replaceAll('\\', '/')).filter((f) => /^(agents|terminal|subagents)\/.*\.ts$/.test(f));
  const readers = files.filter((f) => /services\(\)/.test(readFileSync(join(src, f), 'utf8')));
  assert.deepEqual(readers, ['agents/orbi.ts']);
});
