import { api } from '../../api';
import { useLoad } from '../../hooks';
import { TIER_LABEL, type Tier } from './tiers';

const BY: Record<string, string> = { voce: 'você classificou', plugin: 'o plugin informa', conhecido: 'família conhecida' };

/** Configurações › Modelo: how costly each model is, shown next to it when choosing in a conversation. */
export function ModelTiersEditor() {
  const choices = useLoad(api.modelChoices);
  const c = choices.data;
  if (!c || c.models.length === 0) return null;
  const set = async (model: string, tier: string) => {
    await api.setModelTier(model, tier ? (tier as Tier) : null);
    await choices.reload();
  };
  return (
    <section className="auto-list">
      <h2>Custo dos modelos</h2>
      <p className="muted small pad-x16">Aparece ao lado de cada modelo quando você escolhe um numa conversa. Sem categoria, o modelo aparece em "Sem categoria".</p>
      {c.models.map((m) => (
        <div key={m.id} className="auto-row">
          <div><strong className="mono">{m.id}</strong>{m.id === c.default && <span className="muted"> · padrão</span>}<p className="muted small">{m.tierBy ? BY[m.tierBy] : 'sem categoria'}</p></div>
          <label className="sr-only" htmlFor={`tier-${m.id}`}>Custo de {m.id}</label>
          <select id={`tier-${m.id}`} value={m.tierBy === 'voce' ? m.tier : ''} onChange={(e) => void set(m.id, e.target.value)}>
            <option value="">{m.tier && m.tierBy !== 'voce' ? `${TIER_LABEL[m.tier]} (${BY[m.tierBy!]})` : 'sem categoria'}</option>
            {(['cheap', 'standard', 'premium'] as Tier[]).map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
          </select>
        </div>
      ))}
    </section>
  );
}
