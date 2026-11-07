import { sqlite } from '@flue/runtime/node';
import { loadConfig, loadDotEnv } from './config.ts';
import { purgeDeletedTranscripts } from './conversations/purge.ts';

// Flue's own store (conversations and their streams). Flue loads this file by
// convention, possibly before app.ts, so it reads the configuration itself.
// Before Flue opens it, the transcripts of conversations deleted since the
// last start are erased (Flue has no delete of its own).
loadDotEnv();
const config = loadConfig();
try {
  const purged = purgeDeletedTranscripts(config.dbFile, config.flueDb);
  if (purged.length) console.log(`[orbi] histórico apagado de ${purged.length} conversa(s)`);
} catch (error) {
  console.error('[orbi] não deu para apagar o histórico das conversas apagadas; tento de novo na próxima partida:', error);
}
export default sqlite(config.flueDb);
