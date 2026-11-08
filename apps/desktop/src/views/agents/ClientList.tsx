import { api, type AgentClient } from '../../api';
import { timeAgo } from './connect';

/** What agents may do, and the connected ones with their permissions and a way to cut them off. */
export function ClientList({ clients }: { clients?: AgentClient[] }) {
  const active = (clients ?? []).filter((c) => !c.revokedAt);
  const revoked = (clients ?? []).filter((c) => c.revokedAt);
  return (
    <article className="con-card">
      <strong>O que um agente pode fazer</strong>
      <ul className="con-rules small">
        <li><code>orbi_search</code> e <code>orbi_procedure</code>: ver o que o Orbi sabe fazer. Sempre.</li>
        <li><code>orbi_delegate</code> e <code>orbi_status</code>: pedir uma tarefa. A autonomia continua valendo.</li>
        <li><code>orbi_teach</code>: sugerir procedimentos. Entram só como sugestão.</li>
        <li><code>orbi_pipelines</code> e <code>orbi_pipeline</code>: ver as esteiras. Sempre. <code>orbi_run_pipeline</code>: rodar uma esteira, só se você ligar.</li>
        <li>Passagens que perguntam esperam você, mesmo com destino, a não ser que você ligue "pular perguntas".</li>
      </ul>
      <p className="muted small">Um agente nunca aprova uma ação, nunca vê credenciais e nunca grava direto no cérebro.</p>
      <div className="con-clients">
        {active.length === 0 && <p className="muted small">Nenhum agente conectado.</p>}
        {active.map((c) => (
          <div key={c.id} className="con-client">
            <div className="con-client-head">
              <span className={`dot ${c.lastSeenAt ? 'ok' : 'off'}`} aria-hidden="true" />
              <span className="spacer">
                {c.name}
                <span className="muted small"> · {c.lastSeenAt ? `visto ${timeAgo(c.lastSeenAt)}` : 'ainda não chamou'}</span>
              </span>
              <button type="button" className="btn small danger" onClick={() => void api.revokeAgentClient(c.id)}>Revogar</button>
            </div>
            <div className="con-perms small">
              <label><input type="checkbox" checked={c.canDelegate} onChange={(e) => void api.editAgentClient(c.id, { canDelegate: e.target.checked })} /> pedir</label>
              <label><input type="checkbox" checked={c.canTeach} onChange={(e) => void api.editAgentClient(c.id, { canTeach: e.target.checked })} /> sugerir</label>
              <label><input type="checkbox" checked={c.canRunPipelines} onChange={(e) => void api.editAgentClient(c.id, { canRunPipelines: e.target.checked })} /> rodar esteiras</label>
              <label className={c.canRunPipelines ? '' : 'muted'} title="O destino do agente libera as passagens que perguntam">
                <input type="checkbox" checked={c.canSkipPassages} disabled={!c.canRunPipelines} onChange={(e) => void api.editAgentClient(c.id, { canSkipPassages: e.target.checked })} /> pular perguntas
              </label>
            </div>
          </div>
        ))}
        {revoked.length > 0 && <p className="muted small">Revogados: {revoked.map((c) => c.name).join(', ')}</p>}
      </div>
    </article>
  );
}
