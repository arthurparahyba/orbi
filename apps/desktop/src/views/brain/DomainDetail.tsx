import { useState } from 'react';
import { api, type Bridge } from '../../api';
import { useLive } from '../../hooks';
import { FoundInLine } from './FoundInLine';


/**
 * Um domínio aberto: o vocabulário dele, os fatos, os playbooks que nasceram nele, e as pontes —
 * quem empresta o quê, para quê (documento 28). O nome vazio é `comum`.
 */
export function DomainDetailPanel({ name, onBack, onChanged }: { name: string; onBack: () => void; onChanged: () => void }) {
  const detail = useLive(() => api.domain(name), ['brain'], [name]);
  const [error, setError] = useState<string>();

  if (!detail.data) return <p className="muted pad">{detail.error ? `Erro: ${detail.error}` : 'Carregando…'}</p>;
  const { domain, types, facts, playbooks, bridges } = detail.data;
  const comum = name === '';

  return (
    <div className="domain-detail">
      <nav className="domain-crumbs">
        <button type="button" className="btn small" onClick={onBack}>← Domínios</button>
        <code className={`domain-name ${comum ? 'amber' : ''}`}>{comum ? 'comum' : domain.name}</code>
      </nav>

      <header>
        <p className="muted">
          {comum
            ? 'Vale em todo domínio e entra em toda busca. É o que evita que o mesmo fato seja aprendido uma vez por assunto.'
            : domain.description || 'Sem descrição.'}
        </p>
        {domain.bornFrom && <p className="muted small">Nasceu em <code>{domain.bornFrom}</code>.</p>}
      </header>

      {error && <p className="error small">{error}</p>}

      <div className="domain-columns">
        <section className="ui-card">
          <h2>Tipos deste domínio</h2>
          <p className="muted small">
            O vocabulário que só faz sentido aqui. Ao aprender um tipo novo, o Orbi lê estes, não os do cérebro inteiro.
          </p>
          {types.length === 0 ? <p className="muted small">Nenhum.</p> : (
            <ul className="domain-list">
              {types.map((t) => (
                <li key={t}>
                  <code>{t}</code>
                  {!comum && (
                    <button
                      type="button"
                      className="btn tiny"
                      onClick={async () => {
                        setError(undefined);
                        try { await api.setTypeDomain(t, null); detail.reload(); onChanged(); }
                        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                      }}
                    >
                      mover para comum
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ui-card">
          <h2>Playbooks deste domínio</h2>
          <p className="muted small">
            Um playbook é do domínio dos fatos que ele descobriu e usa. Ninguém marcou isso à mão.
          </p>
          {playbooks.length === 0 ? <p className="muted small">Nenhum.</p> : (
            <ul className="domain-list">
              {playbooks.map((p) => (
                <li key={p.name}>
                  <code>{p.name}</code>
                  <span className="pill tiny">N{p.level}</span>
                  <span className="muted small">{p.uses} {p.uses === 1 ? 'execução' : 'execuções'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="ui-card">
        <h2>Pontes</h2>
        <p className="muted small">
          Domínio não é parede: um fato nasce num domínio e é emprestado por outros. Uma ponte é uma relação cujas
          pontas têm domínios diferentes — relação com <code>comum</code> não é ponte, porque <code>comum</code> já
          está no alcance de todos.
        </p>
        {bridges.length === 0 ? (
          <p className="muted small">
            {comum ? 'comum não tem ponte: ele já entra em toda busca.' : 'Nenhuma: este domínio não empresta nem pega fato emprestado.'}
          </p>
        ) : (
          <ul className="domain-bridge-list">
            {bridges.map((b) => <BridgeRow key={`${b.from}-${b.rel}-${b.to}`} b={b} mine={name} />)}
          </ul>
        )}
      </section>

      <section className="ui-card">
        <h2>Fatos</h2>
        {facts.length === 0 ? <p className="muted small">Nenhum.</p> : (
          <ul className="domain-list">
            {facts.slice(0, 40).map((f) => (
              <li key={f.id} className="domain-fact">
                <code>{f.id}</code>
                <span className="pill tiny">{f.type}</span>
                <FoundInLine e={f} />
              </li>
            ))}
          </ul>
        )}
        {facts.length > 40 && <p className="muted small">+ {facts.length - 40} fatos.</p>}
      </section>
    </div>
  );
}

function BridgeRow({ b, mine }: { b: Bridge; mine: string }) {
  const empresta = b.toDomain === mine;
  return (
    <li>
      <code>{empresta ? b.to : b.from}</code>
      <span className="muted small">{empresta ? 'é usado por' : 'usa'}</span>
      <code>{empresta ? b.from : b.to}</code>
      <span className="pill tiny">{empresta ? b.fromDomain : b.toDomain}</span>
      <span className="muted small">pela relação <code>{b.rel}</code></span>
    </li>
  );
}
