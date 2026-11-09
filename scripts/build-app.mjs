#!/usr/bin/env node
// Builds the Orbi desktop app with the runtime inside it.
//
//   npm run build                    → Orbi.app + .dmg (macOS), .deb/.AppImage (Linux), .msi (Windows)
//   npm run build -- --bundles dmg   → extra args go to `tauri build`
//
// Steps:
//   1. build the runtime (apps/runtime/dist); the shared contract is bundled into it
//   2. install the runtime's production dependencies — exactly the versions in the
//      root package-lock.json — into apps/desktop/src-tauri/resources/runtime, and
//      prune binaries for other platforms
//   3. copy this machine's Node next to the app executable as `orbi-node`, so the
//      app doesn't need a Node installed on the user's machine
//   4. tauri build with src-tauri/tauri.bundle.conf.json (adds the runtime and orbi-node)
//
// Run it on the platform you are building for: native modules (keyring, onnxruntime)
// are installed for the host.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = join(root, 'apps', 'runtime');
const desktopDir = join(root, 'apps', 'desktop');
const tauriDir = join(desktopDir, 'src-tauri');
const stage = join(tauriDir, 'resources', 'runtime');
const scratch = join(tauriDir, 'resources', '.install');
const binDir = join(tauriDir, 'binaries');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const tauriArgs = process.argv.slice(2);

const step = (msg) => console.log(`\n▸ ${msg}`);
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: win });
const size = (p) => {
  const s = statSync(p, { throwIfNoEntry: false });
  if (!s) return 0;
  return s.isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : s.size;
};
const mb = (b) => `${Math.round(b / 1024 / 1024)} MB`;

// The same build stamp in the runtime and in the UI: the app warns when the runtime that answers
// on 127.0.0.1:3000 is another one (an older install or an `npm start` left running).
if (!process.env.ORBI_BUILD) {
  let sha = 'local';
  try { sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
  process.env.ORBI_BUILD = `${sha}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
}

// ── 0. checks ───────────────────────────────────────────────────────────────
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Node ${process.versions.node}: o Orbi precisa de Node ≥ 22.13 (node:sqlite). Este Node vai junto no app.`);
  process.exit(1);
}
let triple;
try {
  triple = /host: (\S+)/.exec(execFileSync('rustc', ['-vV'], { encoding: 'utf8' }))[1];
} catch {
  console.error('rustc não encontrado. Instale o Rust (https://rustup.rs): o Tauri precisa dele para gerar o app.');
  process.exit(1);
}
if (!existsSync(join(root, 'node_modules'))) {
  console.error('Dependências não instaladas. Rode `npm install` na raiz primeiro.');
  process.exit(1);
}

// ── 1. runtime ──────────────────────────────────────────────────────────────
step('Compilando o runtime');
run(npm, ['run', 'build', '-w', '@orbi/runtime'], root);

// ── 2. runtime + production dependencies ────────────────────────────────────
step('Montando o runtime para o app (só dependências de produção, versões do lockfile)');
rmSync(stage, { recursive: true, force: true });
rmSync(scratch, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(runtimeDir, 'dist'), join(stage, 'dist'), { recursive: true, filter: (src) => !src.endsWith('.map') });
for (const f of ['package.json', '.env.example']) copyFileSync(join(runtimeDir, f), join(stage, f));

// `npm ci` needs the workspace layout the lockfile describes: copy just the manifests.
for (const f of ['package.json', 'package-lock.json']) cpSync(join(root, f), join(scratch, f));
// Every workspace the root package.json declares ("apps/*", "packages/*").
const workspaces = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces.flatMap((pattern) => {
  const base = pattern.replace(/\/\*$/, '');
  return pattern.endsWith('/*') ? readdirSync(join(root, base)).map((d) => `${base}/${d}`) : [pattern];
});
for (const ws of workspaces.filter((w) => existsSync(join(root, w, 'package.json')))) {
  mkdirSync(join(scratch, ws), { recursive: true });
  copyFileSync(join(root, ws, 'package.json'), join(scratch, ws, 'package.json'));
}
// ORBI_SKIP_INSTALL_SCRIPTS=1 only for sandboxes that can't download postinstall binaries.
run(npm, ['ci', '--omit=dev', '-w', '@orbi/runtime', '--no-audit', '--no-fund', ...(process.env.ORBI_SKIP_INSTALL_SCRIPTS ? ['--ignore-scripts'] : [])], scratch);
rmSync(join(scratch, 'node_modules', '@orbi'), { recursive: true, force: true }); // workspace links
renameSync(join(scratch, 'node_modules'), join(stage, 'node_modules'));
rmSync(scratch, { recursive: true, force: true });

// Prune what can never run on this platform.
const plat = process.platform; // darwin | linux | win32
const arch = process.arch; // arm64 | x64
const nm = join(stage, 'node_modules');
const pruned = [];
const drop = (p) => {
  if (existsSync(p)) {
    pruned.push(`${p.slice(nm.length + 1)} (${mb(size(p))})`);
    rmSync(p, { recursive: true, force: true });
  }
};
// onnxruntime-node (local Whisper) bundles every OS/arch.
const ort = join(nm, 'onnxruntime-node', 'bin');
if (existsSync(ort)) {
  for (const napi of readdirSync(ort)) {
    for (const os of readdirSync(join(ort, napi))) {
      if (os !== plat) drop(join(ort, napi, os));
      else for (const a of readdirSync(join(ort, napi, os))) if (a !== arch) drop(join(ort, napi, os, a));
    }
  }
}
if (pruned.length) console.log(`  removido (outras plataformas):\n    ${pruned.join('\n    ')}`);
console.log(`  runtime no app: ${mb(size(stage))}`);

// ── 3. Node next to the executable ──────────────────────────────────────────
step(`Copiando o Node ${process.versions.node} (${triple}) para dentro do app como orbi-node`);
rmSync(binDir, { recursive: true, force: true });
mkdirSync(binDir, { recursive: true });
const nodeOut = join(binDir, `orbi-node-${triple}${win ? '.exe' : ''}`);
copyFileSync(process.execPath, nodeOut);
chmodSync(nodeOut, 0o755);

// ── 4. tauri build ──────────────────────────────────────────────────────────
step('Gerando o executável (tauri build)');
run(npm, ['run', 'tauri', '-w', '@orbi/desktop', '--', 'build', '--config', 'src-tauri/tauri.bundle.conf.json', ...tauriArgs], root);

const bundleDir = join(tauriDir, 'target', 'release', 'bundle');
if (existsSync(bundleDir)) {
  console.log('\n✔ Pronto. Pacotes:');
  for (const kind of readdirSync(bundleDir)) {
    for (const f of readdirSync(join(bundleDir, kind))) if (!f.startsWith('.')) console.log(`  ${join(bundleDir, kind, f)}`);
  }
}
