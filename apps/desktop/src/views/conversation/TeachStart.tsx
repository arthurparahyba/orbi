import { RecordIcon } from '../../components/Icons';

const EXAMPLES = [
  'Vou te ensinar como subir a versão de um front no portal.',
  'Atualiza a versão do novo-front no portal para 2.4.0',
  'O que você já sabe sobre o repositório pagamentos-api?',
];

/** A conversation with nothing yet: what this screen is for and the ways to teach (the stage bar above shows the path). */
export function TeachStart({ send, onShow }: { send(text: string): void; onShow(): void }) {
  return (
    <div className="teach-start">
      <h2>O que você quer me ensinar?</h2>
      <p className="muted">Explique como você faz, do seu jeito, aqui embaixo. Eu tento fazer junto, combinamos onde começa e termina, e eu guardo. Depois é só pedir.</p>
      <div className="teach-ways">
        <div className="teach-way">
          <strong>Explicar com palavras</strong>
          <span className="muted">Escreva ou dite o passo a passo na caixa abaixo.</span>
        </div>
        <button type="button" className="teach-way" onClick={onShow}>
          <strong><RecordIcon size={13} /> Mostrar no navegador</strong>
          <span className="muted">Você faz e narra; eu acompanho os cliques e o que você diz.</span>
        </button>
        <div className="teach-way">
          <strong>Pedir algo que já sei</strong>
          <span className="muted">Se eu já aprendi, é só pedir: eu faço e peço aprovação quando precisar.</span>
        </div>
      </div>
      <div className="suggest-chips">
        <span className="muted">Exemplos:</span>
        {EXAMPLES.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}
      </div>
    </div>
  );
}
