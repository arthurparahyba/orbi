/**
 * run_python runs each script in its own empty folder, with no environment
 * from the user's session, and removes the folder afterwards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPython } from '../src/agents/tools/terminal.ts';

test('run_python: pasta própria, sem variáveis nem HOME do usuário', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-py-'));
  // A6: the tool gets only the folder it needs, no Orbi to build.
  const scratchDir = join(cwd, 'scratch');
  process.env.GITHUB_TOKEN = 'ghp_nao-pode-vazar';
  try {
    const code = [
      'import os, json',
      'print(json.dumps({"env": sorted(os.environ), "home": os.environ.get("HOME"), "cwd": os.getcwd(), "files": os.listdir(".")}))',
    ].join('\n');
    const run = (runPython({ scratchDir }) as unknown as { run(a: unknown): Promise<{ output: string }> }).run;
    const { output } = await run({ data: { code, purpose: 'teste' }, signal: new AbortController().signal });
    const result = JSON.parse(output);
    assert.equal(result.exitCode, 0, result.stderr);
    const seen = JSON.parse(result.stdout);
    assert.ok(!seen.env.includes('GITHUB_TOKEN'), 'token do ambiente não chega ao script');
    assert.ok(!seen.env.includes('USER') && !seen.env.includes('SHELL'));
    assert.equal(seen.home, seen.cwd, 'HOME é a própria pasta da execução');
    assert.deepEqual(seen.files, ['script.py']);
    assert.ok(seen.cwd.startsWith(scratchDir));
    assert.deepEqual(readdirSync(scratchDir).filter((f) => f.startsWith('py-')), [], 'a pasta é apagada depois');
  } finally {
    delete process.env.GITHUB_TOKEN;
  }
});
