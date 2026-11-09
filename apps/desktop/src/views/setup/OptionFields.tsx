import type { ModelOption } from '../../api';
import type { Draft } from './modelSetup';

const ANTHROPIC_KEYS = 'https://console.anthropic.com/settings/keys';

/** The fields one option asks. A plugin asks only the model: its access comes with its implementation. */
export function OptionFields({ option, draft, keySet, onChange }: { option: ModelOption; draft: Draft; keySet: boolean; onChange(d: Draft): void }) {
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => onChange({ ...draft, [k]: e.target.value });
  return (
    <span className="model-fields">
      {option.source === 'anthropic' && (
        <ol className="small">
          <li>Entre no console da Anthropic e abra <a href={ANTHROPIC_KEYS} target="_blank" rel="noreferrer">API Keys</a>.</li>
          <li>Crie uma chave (Create Key) e copie.</li>
          <li>Cole aqui. Ela vai para o .env da pasta de dados do Orbi; nunca para o modelo nem para a conversa.</li>
        </ol>
      )}
      {option.fields.includes('baseUrl') && (
        <label>Endereço do servidor<input value={draft.baseUrl} onChange={set('baseUrl')} placeholder="https://gateway.empresa/v1" /></label>
      )}
      {option.fields.includes('apiKey') && (
        <label>Chave<input type="password" autoComplete="off" value={draft.apiKey} onChange={set('apiKey')} placeholder={keySet ? 'guardada (deixe vazio para manter)' : 'sk-ant-…'} /></label>
      )}
      {option.fields.includes('model') && (
        <label>Modelo
          {option.models.length ? (
            <select value={draft.model} onChange={set('model')}>{option.models.map((m, i) => <option key={m} value={m}>{m}{i === 0 ? ' (o primeiro)' : ''}</option>)}</select>
          ) : (
            <input value={draft.model} onChange={set('model')} placeholder="o padrão do servidor" />
          )}
        </label>
      )}
      {option.source === 'plugin' && <span className="muted small">Sem chave aqui: o acesso já vem na implementação do plugin. Se faltar algo, o teste diz o quê.</span>}
    </span>
  );
}
