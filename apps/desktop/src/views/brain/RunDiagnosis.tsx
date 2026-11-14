import type { Diagnosis } from '../../api';
import { api } from '../../api';

export const CATEGORY_LABEL: Record<Diagnosis['category'], string> = { orbi: 'do Orbi', modelo: 'do modelo' };

/**
 * O que deu errado nesta execução que não é do procedimento (docs/funcionalidades/24): defeito do
 * Orbi ou chamada que o modelo errou. Fica à parte da revisão de propósito: defeito da aplicação
 * nunca volta como mudança no procedimento do desenvolvedor.
 */
export function RunDiagnosis({ found }: { found: Diagnosis[] }) {
  const open = found.filter((f) => f.status === 'open');
  if (open.length === 0) return null;
  return (
    <section className="run-diagnosis" aria-label="Diagnóstico">
      <span className="ui-kicker">Diagnóstico · não é do procedimento</span>
      <ul className="diagnoses">
        {open.map((f) => (
          <li key={f.id}>
            <span className="diag-head">
              <span className={`pill diag-${f.category}`}>{CATEGORY_LABEL[f.category]}</span> <strong>{f.title}</strong>
              {f.times > 1 && <span className="muted small"> · {f.times}ª vez</span>}
            </span>
            <span className="small">{f.detail}</span>
            {f.hint && <span className="small muted mono">{f.hint}</span>}
            <button type="button" className="btn small" onClick={() => void api.dismissDiagnosis(f.id)}>Dispensar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
