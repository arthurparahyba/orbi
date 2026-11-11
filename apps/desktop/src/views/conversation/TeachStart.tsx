import { RecordIcon } from '../../components/Icons';

/**
 * A new conversation: one box for everything. Ask for something, or explain how you do a task;
 * when it is a task the Orbi does not know, it learns it with you and the teaching look (stage
 * bar, panel) appears from there. Showing it in the browser is the one other way in.
 */
export function TeachStart({ onShow }: { onShow(): void }) {
  return (
    <div className="teach-start">
      <h2>O que você precisa?</h2>
      <p className="muted">Peça algo, ou explique como você faz uma tarefa. Se for uma tarefa nova, eu aprendo com você e passo a assumir; a conversa mostra as etapas quando isso acontecer.</p>
      <p className="muted small">
        Prefere mostrar? <button type="button" className="link-btn" onClick={onShow}><RecordIcon size={12} /> Mostrar no navegador</button>
      </p>
    </div>
  );
}
