import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Credentials the Vigia uses but must never learn: kept out of the brain, the
 * conversation and the model. Playbooks hold references (`{{segredo:nome}}`);
 * values are resolved only inside the browser tool, at execution time.
 *
 * Storage, in order of preference:
 *  - `keychain`: the operating system vault (macOS Keychain, Windows Credential
 *    Manager, Linux Secret Service) through @napi-rs/keyring;
 *  - `file`: AES-256-GCM file, for machines without a usable keychain (CI,
 *    containers). The key comes from VIGIA_VAULT_KEY or a 0600 key file.
 * The index (names, descriptions, dates — never values) is a JSON file.
 */
export interface SecretInfo {
  name: string;
  description: string;
  /** Where it was captured, e.g. "https://portal.local/login · campo Senha". */
  origin: string;
  createdAt: string;
  updatedAt: string;
}

export type VaultBackend = 'keychain' | 'file';
const SERVICE = 'vigia';
export const SECRET_REF = /\{\{\s*segredo:([a-z0-9][a-z0-9._/@-]{0,127})\s*\}\}/gi;
export const secretRef = (name: string) => `{{segredo:${name}}}`;

export function secretName(...parts: string[]): string {
  return parts
    .map((p) => p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.@-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/')
    .slice(0, 128);
}

interface KeyringEntry { setPassword(v: string): void; getPassword(): string | null | undefined; deletePassword(): boolean | void }
type KeyringModule = { Entry: new (service: string, account: string) => KeyringEntry };

export class Vault {
  private backendChoice: VaultBackend | undefined;
  private keyring: KeyringModule | undefined;

  constructor(
    private readonly indexFile: string,
    private readonly dataFile: string,
    private readonly keyFile: string,
    private readonly prefer: 'auto' | VaultBackend = 'auto',
  ) {
    mkdirSync(dirname(indexFile), { recursive: true });
  }

  /** Probe once: the OS vault when it works, otherwise the encrypted file. */
  async backend(): Promise<VaultBackend> {
    if (this.backendChoice) return this.backendChoice;
    if (this.prefer !== 'file') {
      try {
        this.keyring = (await import('@napi-rs/keyring')) as unknown as KeyringModule;
        const probe = new this.keyring.Entry(SERVICE, '__probe__');
        probe.setPassword('ok');
        probe.deletePassword();
        return (this.backendChoice = 'keychain');
      } catch (error) {
        if (this.prefer === 'keychain') throw new Error(`cofre do sistema indisponível: ${(error as Error).message}`);
      }
    }
    return (this.backendChoice = 'file');
  }

  list(): SecretInfo[] {
    return Object.values(this.index()).sort((a, b) => a.name.localeCompare(b.name));
  }

  has(name: string): boolean {
    return name in this.index();
  }

  async set(name: string, value: string, meta: { description?: string; origin?: string } = {}): Promise<SecretInfo> {
    if (!/^[a-z0-9][a-z0-9._/@-]{0,127}$/.test(name)) throw new Error(`nome de segredo inválido: ${name}`);
    if (await this.backend() === 'keychain') new this.keyring!.Entry(SERVICE, name).setPassword(value);
    else this.writeFileSecrets({ ...this.readFileSecrets(), [name]: value });
    const index = this.index();
    const now = new Date().toISOString();
    index[name] = {
      name,
      description: meta.description ?? index[name]?.description ?? '',
      origin: meta.origin ?? index[name]?.origin ?? '',
      createdAt: index[name]?.createdAt ?? now,
      updatedAt: now,
    };
    this.writeIndex(index);
    return index[name];
  }

  async get(name: string): Promise<string | undefined> {
    if (await this.backend() === 'keychain') return new this.keyring!.Entry(SERVICE, name).getPassword() ?? undefined;
    return this.readFileSecrets()[name];
  }

  async delete(name: string): Promise<boolean> {
    const index = this.index();
    if (!index[name]) return false;
    if (await this.backend() === 'keychain') {
      try { new this.keyring!.Entry(SERVICE, name).deletePassword(); } catch { /* already gone */ }
    } else {
      const all = this.readFileSecrets();
      delete all[name];
      this.writeFileSecrets(all);
    }
    delete index[name];
    this.writeIndex(index);
    return true;
  }

  /**
   * Replace every `{{segredo:nome}}` inside strings of `value` (deeply) with
   * the stored secret. Returns the resolved copy and the values used, so the
   * caller can redact them from anything it returns.
   */
  async resolve<T>(value: T): Promise<{ value: T; used: string[] }> {
    const used = new Set<string>();
    const missing = new Set<string>();
    const names = new Set<string>();
    const scan = (v: unknown) => {
      if (typeof v === 'string') for (const m of v.matchAll(SECRET_REF)) names.add(m[1].toLowerCase());
      else if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === 'object') Object.values(v).forEach(scan);
    };
    scan(value);
    const values = new Map<string, string>();
    for (const n of names) {
      const s = await this.get(n);
      if (s === undefined) missing.add(n);
      else values.set(n, s);
    }
    if (missing.size) throw new Error(`segredo não encontrado no cofre: ${[...missing].join(', ')} (peça ao desenvolvedor para cadastrar)`);
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') return v.replace(SECRET_REF, (_, n: string) => { const s = values.get(n.toLowerCase())!; used.add(s); return s; });
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    return { value: walk(value) as T, used: [...used] };
  }

  // ── storage ──────────────────────────────────────────────────────────────
  private index(): Record<string, SecretInfo> {
    return existsSync(this.indexFile) ? (JSON.parse(readFileSync(this.indexFile, 'utf8')) as Record<string, SecretInfo>) : {};
  }

  private writeIndex(index: Record<string, SecretInfo>) {
    writeFileSync(this.indexFile, JSON.stringify(index, null, 2), { mode: 0o600 });
  }

  private key(): Buffer {
    const fromEnv = process.env.VIGIA_VAULT_KEY;
    if (fromEnv) return scryptSync(fromEnv, 'vigia-vault', 32);
    if (!existsSync(this.keyFile)) writeFileSync(this.keyFile, randomBytes(32).toString('base64'), { mode: 0o600 });
    chmodSync(this.keyFile, 0o600);
    return Buffer.from(readFileSync(this.keyFile, 'utf8').trim(), 'base64');
  }

  private readFileSecrets(): Record<string, string> {
    if (!existsSync(this.dataFile)) return {};
    const raw = readFileSync(this.dataFile);
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), body = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as Record<string, string>;
  }

  private writeFileSecrets(all: Record<string, string>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(all), 'utf8'), cipher.final()]);
    writeFileSync(this.dataFile, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 });
  }
}

/** Remove secret values from text the model or the UI will see. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s.length >= 3) out = out.split(s).join('••••••');
  return out;
}
