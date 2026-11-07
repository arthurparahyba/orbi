import { useState } from 'react';
import { api, type AgentClient } from '../../api';
import { Segmented } from '../../components/Segmented';
import { CopyText } from '../../components/CopyText';
import { AGENT_KINDS, CLAUDE_MD_SNIPPET, connectCommand, timeAgo, type AgentKind } from './connect';

/**
 * Connect an agent: name it, get a token (shown only now), run the command,
 * paste the CLAUDE.md snippet, and see it show up when it first calls Orbi.
 */
export function ConnectAgent({ url, clients }: { url: string; clients?: AgentClient[] }) {
  const [kind, setKind] = useState<AgentKind>('claude-code');
  const [name, setName] = useState('Claude Code');
  const [created, setCreated] = useState<{ id: string; token: string }>();
  const [error, setError] = useState<string>();

  const pick = (k: AgentKind) => {
    setKind(k);
    if (!created) setName(AGENT_KINDS.find((a) => a.value === k)!.label);
  };
  const generate = async () => {
    setError(undefined);
    try {
      const r = await api.createAgentClient(name);
      setCreated({ id: r.client.id, token: r.token });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const command = connectCommand(kind, url, created?.token ?? 'orb_…');
  const seen = created && clients?.find((c) => c.id === created.id)?.lastSeenAt;

  return (
    <article className="con-card">
      <div className="row gap8">
        <strong className="spacer">Conectar um agente</strong>
        <Segmented label="Qual agente" value={kind} options={AGENT_KINDS} onChange={pick} />
      </div>
      <ol className="con-steps">
        <li>
          <label htmlFor="agent-name">Nome deste agente <span className="muted">(aparece em quem pediu e quem sugeriu)</span></label>
          <div className="row gap8">
            <input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!created} />
            {created
              ? <button type="button" className="btn small" onClick={() => setCreated(undefined)}>Conectar outro</button>
              : <button type="button" className="btn primary small" onClick={generate} disabled={!name.trim()}>Gerar token</button>}
          </div>
          {error && <p className="banner small" role="alert">{error}</p>}
        </li>
        <li>
          {command.how}
          <pre className="code small con-cmd">{command.text}</pre>
          {created
            ? <><CopyText text={command.text} label="Copiar" /> <span className="muted small">O token só aparece agora. Se perder, gere outro e revogue este.</span></>
            : <span className="muted small">Gere o token para completar o comando.</span>}
        </li>
        <li>
          Ensine o agente a usar o Orbi: cole no <code>CLAUDE.md</code> (ou <code>AGENTS.md</code>) dos seus repositórios.
          <div><CopyText text={CLAUDE_MD_SNIPPET} label="Copiar trecho do CLAUDE.md" /></div>
        </li>
        <li>
          {seen
            ? <span className="ok-text">✓ o agente chamou o Orbi {timeAgo(seen)}</span>
            : <span className="muted small">{created ? 'Esperando a primeira chamada do agente… (no Claude Code, rode /mcp e veja o orbi conectado)' : 'Depois de conectar, a primeira chamada aparece aqui.'}</span>}
        </li>
      </ol>
    </article>
  );
}
