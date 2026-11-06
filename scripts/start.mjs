#!/usr/bin/env node
// `npm start`: everything in one command, no Rust needed.
//   1. builds the runtime
//   2. starts it (127.0.0.1:3000, reads apps/runtime/.env)
//   3. starts the app UI (http://localhost:5174) and opens it in the browser
// Ctrl+C stops both. For the native window use `npm run dev`.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const UI_URL = 'http://localhost:5174';
const RUNTIME_URL = 'http://127.0.0.1:3000';

const color = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (s) => console.log(color('1;33', `[orbi] ${s}`));

if (!existsSync(join(root, 'node_modules'))) {
  say('Dependências não instaladas. Rode `npm install` primeiro.');
  process.exit(1);
}

// The model needs a key; without it the app opens but can't answer.
const envFile = join(root, 'apps/runtime/.env');
const envText = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
const llm = process.env.ORBI_LLM ?? /^\s*ORBI_LLM\s*=\s*(\S+)/m.exec(envText)?.[1] ?? 'anthropic';
const hasKey =
  llm !== 'anthropic' ||
  Boolean(process.env.ANTHROPIC_API_KEY) ||
  /^\s*ANTHROPIC_API_KEY\s*=\s*\S+/m.test(envText);
if (!hasKey) {
  say('ANTHROPIC_API_KEY não encontrada. Sem ela o Orbi não responde.');
  say(`  cp apps/runtime/.env.example apps/runtime/.env   e preencha a chave em ${envFile}`);
}

async function portBusy(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}
if (await portBusy(`${RUNTIME_URL}/api/health`)) {
  say(`Já tem algo respondendo em ${RUNTIME_URL} (outro \`npm start\` ou \`npm run demo\`?). Pare-o e tente de novo.`);
  process.exit(1);
}

say('Compilando o runtime…');
try {
  execFileSync(npm, ['run', 'build', '-w', '@orbi/runtime'], { cwd: root, stdio: 'pipe', shell: win });
} catch (err) {
  console.error(String(err.stdout ?? ''), String(err.stderr ?? ''));
  say('A compilação do runtime falhou (saída acima).');
  process.exit(1);
}

const children = [];
function start(name, tint, args) {
  const child = spawn(npm, args, { cwd: root, shell: win, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = color(tint, `[${name}]`);
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) console.log(`${prefix} ${line}`);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) {
      say(`${name} parou (código ${code}). Encerrando.`);
      stop(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('runtime', '36', ['start', '-w', '@orbi/runtime']);
start('app', '35', ['run', 'dev', '-w', '@orbi/desktop']);

// Wait for both, then open the browser.
const deadline = Date.now() + 60_000;
while (Date.now() < deadline && !stopping) {
  if ((await portBusy(`${RUNTIME_URL}/api/health`)) && (await portBusy(UI_URL))) break;
  await new Promise((r) => setTimeout(r, 500));
}
if (!stopping) {
  say(`Pronto: ${UI_URL}  (Ctrl+C para encerrar)`);
  if (!process.env.ORBI_NO_OPEN) {
    const opener = process.platform === 'darwin' ? 'open' : win ? 'explorer' : 'xdg-open';
    spawn(opener, [UI_URL], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
}
