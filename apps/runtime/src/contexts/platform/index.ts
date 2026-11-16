/**
 * Contexto `platform` — onde o Orbi está rodando (documento 26, mapa em `docs/modulos.md`).
 *
 * Esta é a única porta do contexto (test/boundary.test.ts acusa quem alcançar o de dentro).
 * Ele é dono da tabela `settings`: ninguém mais a lê ou escreve em SQL cru.
 *
 * os           diferenças de sistema operacional, uma implementação por sistema
 * env          o arquivo .env da instalação
 * preferences  o que o desenvolvedor escolheu e fica entre execuções
 */

export { platform, platformFor, appDataHome } from './os/src/os.ts';
export type { Platform, PlatformId } from './os/src/os.ts';

export { setEnvValue, withEnvValue } from './env/src/env-file.ts';

export { Preferences } from './preferences/src/preferences.ts';
