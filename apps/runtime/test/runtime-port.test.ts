import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A7: Flue is reached only through agents/runtime-port.ts.
test('só o runtime-port importa o Flue', () => {
  const src = join(import.meta.dirname, '..', 'src');
  const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts'));
  const offenders = files.filter((f) => !f.replaceAll('\\', '/').endsWith('agents/runtime-port.ts') && /from '@flue\/runtime/.test(readFileSync(join(src, f), 'utf8')));
  assert.deepEqual(offenders, []);
});
