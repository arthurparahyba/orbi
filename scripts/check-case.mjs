// Fails when two tracked files differ only in letter case: they collide on Windows and macOS
// (case-insensitive), which broke the Windows build once (ModelSetup.tsx × modelSetup.ts).
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const seen = new Map();
const clashes = [];
for (const f of files) {
  const key = f.replace(/\.(tsx?|mjs|js)$/, '').toLowerCase();
  if (seen.has(key) && seen.get(key) !== f) clashes.push(`${seen.get(key)} × ${f}`);
  else seen.set(key, f);
}
if (clashes.length) {
  console.error(`arquivos que só mudam em maiúsculas/minúsculas (quebram no Windows e no macOS):\n  ${clashes.join('\n  ')}`);
  process.exit(1);
}
