#!/usr/bin/env node
// `npm run dev`: native window + runtime. Needs Rust (cargo) for the Tauri window.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';

try {
  execFileSync('cargo', ['--version'], { stdio: 'ignore' });
} catch {
  console.log(`[orbi] A janela nativa precisa do Rust, e o \`cargo\` não foi encontrado.
[orbi]   Instale:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
[orbi]   Depois reabra o terminal (ou: source "$HOME/.cargo/env") e rode \`npm run dev\` de novo.
[orbi]   Sem Rust, use \`npm start\`: o mesmo Orbi, no navegador.`);
  process.exit(1);
}

const run = (args) => execFileSync(npm, args, { cwd: root, stdio: 'inherit', shell: win });
try {
  run(['run', 'build', '-w', '@orbi/runtime']);
  run(['run', 'tauri', '-w', '@orbi/desktop', '--', 'dev']);
} catch (err) {
  process.exit(typeof err.status === 'number' ? err.status : 1);
}
