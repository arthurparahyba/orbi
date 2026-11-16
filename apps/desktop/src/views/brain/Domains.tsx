import { useState } from 'react';
import { api, type DomainOverview, type DomainSize } from '../../api';
import { useLive } from '../../hooks';
import { DomainDetailPanel } from './DomainDetail';

/**
 * Domínios: o assunto em que cada coisa foi aprendida (documento 28). `comum` vem primeiro e
 * sempre, porque é a camada de base — vale em todo domínio e entra em toda busca.
 */
export function Domains() {
  const overview = useLive(api.domains, ['brain']);
  const [open, setOpen] = useState<string>();

  if (!overview.data) return <p className="muted pad">{overview.error ? `Erro: ${overview.error}` : 'Carregando…'}</p>;
  if (open !== undefined) return <DomainDetailPanel name={open} onBack={() => setOpen(undefined)} onChanged={() => void overview.reload()} />;

  const { domains, lends, mismatched } = overview.data;
  const [comum, ...rest] = domains;

  return (
    <div className="domains">
      {comum && <Base d={comum} onOpen={() => setOpen('')} />}
      {rest.length === 0 ? (
        <div className="agents-empty">
          <p>Nenhum domínio ainda.</p>
          <p className="muted small">
            O Orbi cria um quando aprende algo que não se parece com nada do que já sabe — e pergunta antes. Até lá,
            tudo que ele aprende é <code>comum</code>: vale em todo trabalho.
          </p>
        </div>
      ) : (
        <div className="domain-grid">
          {rest.map((d) => <Card key={d.name} d={d} lends={lends} onOpen={() => setOpen(d.name)} />)}
        </div>
      )}
      {mismatched.length > 0 && <Mismatched facts={mismatched} onDone={() => void overview.reload()} />}
    </div>
  );
}

function Base({ d, onOpen }: { d: DomainSize; onOpen: () => void }) {
  return (
    <section className="domain-base">
      <div>
        <div className="domain-base-head">
          <code className="domain-name amber">comum</code>
          <span className="pill">camada de base</span>
        </div>
        <p className="muted small">{d.description || 'Vale em todo domínio e entra em toda busca: você, suas máquinas, seus repositórios.'}</p>
      </div>
      <div className="domain-counts">
        <Count n={d.types} label="tipos" />
        <Count n={d.entities} label="fatos" />
        <Count n={d.playbooks} label="playbooks" />
        <button type="button" className="btn small" onClick={onOpen}>Abrir</button>
      </div>
    </section>
  );
}

function Card({ d, lends, onOpen }: { d: DomainSize; lends: DomainOverview['lends']; onOpen: () => void }) {
  const empresta = lends.filter((l) => l.from === d.name);
  const pega = lends.filter((l) => l.to === d.name);
  return (
    <article className="domain-card">
      <button type="button" className="domain-card-open" onClick={onOpen}>
        <code className="domain-name">{d.name}</code>
      </button>
      {d.description && <p className="muted small">{d.description}</p>}
      {d.bornFrom && <p className="muted small">Nasceu em <code>{d.bornFrom}</code>.</p>}
      <div className="domain-counts">
        <Count n={d.types} label="tipos" />
        <Count n={d.entities} label="fatos" />
        <Count n={d.playbooks} label="playbooks" />
      </div>
      <footer className="domain-bridges muted small">
        {empresta.length === 0 && pega.length === 0 ? (
          <span className="ok">Isolado — nenhum outro domínio usa fato deste, nem o contrário</span>
        ) : (
          <>
            {empresta.map((l) => <span key={`e${l.to}`}>Empresta para <code>{l.to}</code> ({l.facts})</span>)}
            {pega.map((l) => <span key={`p${l.from}`}>Pega de <code>{l.from}</code> ({l.facts})</span>)}
          </>
        )}
      </footer>
    </article>
  );
}

/**
 * Fato comum cujo tipo é de um domínio. Nulo significa comum, então não existe "fato sem domínio"
 * para arrumar: o que existe é desacordo com a regra 1 (o tipo ganha), nos fatos de antes dos
 * domínios. Pôr cada um no domínio do tipo é aplicar aquela regra para trás.
 */
function Mismatched({ facts, onDone }: { facts: Array<{ id: string; type: string; typeDomain: string }>; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="domain-undecided">
      <div>
        <strong>{facts.length} fatos em desacordo com o tipo deles</strong>
        <p className="muted small">
          São comum, mas o tipo de cada um é de um domínio. Pela regra, o tipo ganha — então eles entram em toda busca
          quando deveriam entrar só na do domínio dele. É o que sobrou de antes dos domínios existirem.
        </p>
        <ul className="muted small domain-undecided-list">
          {facts.slice(0, 5).map((f) => (
            <li key={f.id}>
              <code>{f.id}</code> <span className="pill tiny">{f.type}</span> → <code>{f.typeDomain}</code>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className="btn small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          for (const f of facts) await api.setEntityDomain(f.id, f.typeDomain);
          onDone();
          setBusy(false);
        }}
      >
        Pôr cada um no domínio do tipo
      </button>
    </section>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return <span className="domain-count"><strong>{n}</strong> {label}</span>;
}
