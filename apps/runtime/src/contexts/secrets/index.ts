/**
 * Contexto `secrets` — o que nunca pode sair (documento 26, mapa em `docs/modulos.md`).
 *
 * Um módulo só, então o código fica plano em `src/`. Esta é a única porta do contexto.
 * A credencial nunca chega ao modelo, ao cérebro, à conversa nem ao log: a ferramenta
 * resolve `{{segredo:nome}}` dentro dela, e a saída passa por `redact`.
 */

export { Vault, redact, secretName, secretRef, SECRET_REF } from './src/vault.ts';
export type { SecretInfo, VaultBackend } from './src/vault.ts';

export { vaultRoutes } from './http.ts';
