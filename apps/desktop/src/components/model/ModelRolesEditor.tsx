import { api, type ModelRoles } from '../../api';
import { useLoad } from '../../hooks';
import { TIER_LABEL } from './tiers';

const ROLES: Array<{ role: keyof ModelRoles; label: string; hint: string }> = [
  { role: 'conversa', label: 'Conversa', hint: 'perguntas e pedidos; a escolha feita numa conversa vale para ela' },
  { role: 'executar', label: 'Executar procedimento', hint: 'enquanto um procedimento roda' },
  { role: 'aprender', label: 'Aprender e corrigir', hint: 'ensaio, ensino e a revisão que pede mudança: vale um modelo melhor' },
  { role: 'conhecimento', label: 'Revisor de conhecimento', hint: 'lê o que a execução leu e propõe fatos' },
];

/** Autonomia › Modelo: the model of each kind of work; the runtime picks the kind of every turn. */
export function ModelRolesEditor() {
  const roles = useLoad(api.modelRoles);
  const choices = useLoad(api.modelChoices);
  const r = roles.data;
  const c = choices.data;
  if (!r || !c) return null;
  const set = async (role: keyof ModelRoles, model: string) => {
    await api.setModelRole(role, model || null);
    await roles.reload();
  };
  return (
    <section className="auto-list">
      <h2>Modelo por tipo de trabalho</h2>
      {ROLES.map(({ role, label, hint }) => (
        <div key={role} className="auto-row">
          <div><strong>{label}</strong><p className="muted small">{hint}</p></div>
          <label className="sr-only" htmlFor={`role-${role}`}>Modelo para {label}</label>
          <select id={`role-${role}`} value={r[role].set ? r[role].model : ''} onChange={(e) => void set(role, e.target.value)}>
            <option value="">{`padrão (${r[role].model})`}</option>
            {c.models.map((m) => <option key={m.id} value={m.id}>{m.id}{m.tier ? ` · ${TIER_LABEL[m.tier]}` : ''}</option>)}
          </select>
        </div>
      ))}
    </section>
  );
}
