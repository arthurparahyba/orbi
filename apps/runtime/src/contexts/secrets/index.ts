/**
 * The `secrets` context — what must never get out (documento 26, map in `docs/modulos.md`).
 *
 * One module only, so the code is flat in `src/`. This is the context's only door. A credential
 * never reaches the model, the brain, the conversation or the log: the tool resolves
 * `{{segredo:nome}}` inside itself, and the output goes through `redact`.
 */

export { Vault, redact, secretName, secretRef, SECRET_REF } from './src/vault.ts';
export type { SecretInfo, VaultBackend } from './src/vault.ts';

export { vaultRoutes } from './http.ts';
