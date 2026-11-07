import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/**
 * Erases the transcripts of deleted conversations from Flue's store. Flue has
 * no delete and keeps conversations cached while running, so this runs at
 * start, before Flue opens its file (db.ts). It knows Flue's tables (2.3):
 * if a table is missing it is skipped, and the conversation stays marked to try again.
 */
export function purgeDeletedTranscripts(orbiDbFile: string, flueDbFile: string, agent = 'orbi'): string[] {
  if (!existsSync(orbiDbFile) || !existsSync(flueDbFile)) return [];
  const orbi = new DatabaseSync(orbiDbFile);
  try {
    const hasTable = orbi.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'deleted_conversations'").get();
    if (!hasTable) return [];
    const ids = (orbi.prepare('SELECT id FROM deleted_conversations WHERE purged_at IS NULL').all() as Array<{ id: string }>).map((r) => r.id);
    if (!ids.length) return [];
    const flue = new DatabaseSync(flueDbFile);
    const purged: string[] = [];
    try {
      const tables = new Set((flue.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name));
      const run = (table: string, sql: string, ...args: string[]) => {
        if (tables.has(table)) flue.prepare(sql).run(...args);
      };
      for (const id of ids) {
        const path = `agents/${agent}/${id}`;
        const session = `agent-session:${JSON.stringify([agent, id]).slice(0, -1)},%`;
        flue.exec('BEGIN');
        try {
          for (const t of ['flue_conversation_streams', 'flue_conversation_stream_batches', 'flue_conversation_stream_batch_chunks', 'flue_conversation_fold_checkpoints', 'flue_conversation_fold_checkpoint_chunks']) {
            run(t, `DELETE FROM ${t} WHERE path = ?`, path);
          }
          run('flue_attachment_chunks', 'DELETE FROM flue_attachment_chunks WHERE stream_path = ?', path);
          run('flue_attachments', 'DELETE FROM flue_attachments WHERE stream_path = ?', path);
          if (tables.has('flue_agent_submissions')) {
            run('flue_submission_chunks', 'DELETE FROM flue_submission_chunks WHERE submission_id IN (SELECT submission_id FROM flue_agent_submissions WHERE session_key LIKE ?)', session);
            run('flue_agent_submissions', 'DELETE FROM flue_agent_submissions WHERE session_key LIKE ?', session);
          }
          flue.exec('COMMIT');
          purged.push(id);
        } catch (error) {
          flue.exec('ROLLBACK');
          throw error;
        }
      }
    } finally {
      flue.close();
    }
    const mark = orbi.prepare('UPDATE deleted_conversations SET purged_at = ? WHERE id = ?');
    for (const id of purged) mark.run(new Date().toISOString(), id);
    return purged;
  } finally {
    orbi.close();
  }
}
